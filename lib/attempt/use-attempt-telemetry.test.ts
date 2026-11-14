// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttemptTelemetry } from "./use-attempt-telemetry";
import { useAnswerStore } from "./answer-store";
import type { AttemptTelemetry } from "./telemetry";
import type { ClientActivityEventType } from "@/lib/api/monitoring";
import type { DetailQuestionView } from "@/lib/api/student-attempt";

/**
 * FE-4 regression suite: the telemetry store-diff must classify USER intent
 * (SELECTED/CHANGED/CLEARED, flag toggles), never fabricate events across
 * hydration, and remove every listener on unmount. The emitter singleton is
 * mocked so tracked calls are observable without any network.
 *
 * (.ts, not .tsx — the vitest include globs only pick ".ts" under lib;
 * the harness uses createElement instead of JSX.)
 */

const tracked: [ClientActivityEventType, Record<string, unknown> | undefined][] = [];

vi.mock("./telemetry", () => ({
  createAttemptTelemetry: vi.fn(() =>
    (() => ({
      attemptId: 0,
      track: (type: ClientActivityEventType, metadata?: Record<string, unknown>) => {
        tracked.push([type, metadata]);
      },
      flush: () => {},
      dispose: () => {},
      getStats: () => ({ queued: 0, sent: 0, dropped: 0, failedBatches: 0 }),
    }))() as AttemptTelemetry
  ),
  markAttemptVisited: vi.fn(() => false),
  resetAttemptTelemetry: () => {},
}));

import { markAttemptVisited } from "./telemetry";

type HarnessProps = {
  attemptId: number;
  clientInstanceId: string;
  wsStatus?: "disconnected" | "connecting" | "connected";
  autosaveStatus?: "idle" | "saving" | "saved" | "error" | "blocked";
};

function Harness(props: HarnessProps) {
  // The mocked singleton's track() already records into `tracked` — the
  // component only needs to mount the hook (React Compiler forbids
  // reassigning outer-scope vars from a component).
  useAttemptTelemetry(props.attemptId, props.clientInstanceId, {
    wsStatus: props.wsStatus,
    autosaveStatus: props.autosaveStatus,
  });
  return null;
}

function mountHarness(props: Partial<HarnessProps> = {}) {
  return render(
    createElement(Harness, {
      attemptId: 1,
      clientInstanceId: "cid",
      ...props,
    })
  );
}

function questions(
  qid: number,
  payload: unknown,
  sequence = 0
): DetailQuestionView[] {
  return [
    {
      attemptQuestionId: qid,
      examQuestionId: qid * 100,
      questionType: "SINGLE_CHOICE",
      displayOrder: qid,
      content: "q",
      defaultPoints: 1,
      sectionTitle: null,
      sectionInstructions: null,
      sectionPosition: null,
      options: [],
      savedAnswer:
        payload == null
          ? null
          : { answerPayload: payload, sequenceNumber: sequence },
    },
  ];
}

beforeEach(() => {
  tracked.length = 0;
  vi.mocked(markAttemptVisited).mockReset();
  useAnswerStore.getState().reset();
  useAnswerStore.setState({ answers: {}, flagged: {}, hydrateGeneration: 0 });
});

afterEach(cleanup);

describe("answer-store diff semantics (user intent only)", () => {
  it("hydrates silently, then classifies SELECTED / CHANGED / CLEARED with {questionId} only", () => {
    mountHarness();

    act(() => {
      useAnswerStore.getState().hydrate(questions(7, null));
    });
    expect(tracked).toEqual([]); // hydrate = server state, never an event

    act(() => {
      useAnswerStore.getState().setAnswer(7, { selectedOptionKey: "a" });
    });
    expect(tracked).toEqual([["ANSWER_SELECTED", { questionId: 7 }]]);

    act(() => {
      useAnswerStore.getState().setAnswer(7, { selectedOptionKey: "b" });
    });
    expect(tracked[1]).toEqual(["ANSWER_CHANGED", { questionId: 7 }]);

    act(() => {
      useAnswerStore.getState().clearAnswer(7);
    });
    expect(tracked[2]).toEqual(["ANSWER_CLEARED", { questionId: 7 }]);

    // No answer payload ever leaks into metadata.
    for (const [, metadata] of tracked) {
      expect(metadata).toEqual({ questionId: 7 });
    }
  });

  it("markSaved (dirty/sequence flip only) emits nothing", () => {
    mountHarness();
    act(() => {
      useAnswerStore.getState().hydrate(questions(7, { selectedOptionKey: "a" }, 1));
      useAnswerStore.getState().markSaved(7, 2, { selectedOptionKey: "a" });
    });
    expect(tracked).toEqual([]);
  });

  it("flag toggles emit QUESTION_FLAGGED / QUESTION_UNFLAGGED", () => {
    mountHarness();
    act(() => {
      useAnswerStore.getState().hydrate(questions(7, null));
      useAnswerStore.getState().toggleFlag(7);
    });
    expect(tracked).toEqual([["QUESTION_FLAGGED", { questionId: 7 }]]);
    act(() => {
      useAnswerStore.getState().toggleFlag(7);
    });
    expect(tracked[1]).toEqual(["QUESTION_UNFLAGGED", { questionId: 7 }]);
  });
});

describe("FE-4: hydration suppression", () => {
  it("re-hydration never fabricates UNFLAGGED / CLEARED / CHANGED", () => {
    mountHarness();
    act(() => {
      useAnswerStore.getState().hydrate(questions(7, null));
      useAnswerStore.getState().setAnswer(7, { selectedOptionKey: "a" });
      useAnswerStore.getState().toggleFlag(7);
    });
    expect(tracked.length).toBe(2); // SELECTED + FLAGGED

    // WS-reconnect refetch → hydrate replaces the store (answers reset to the
    // saved state, flags wiped). None of that is user intent.
    act(() => {
      useAnswerStore.getState().hydrate(questions(7, null));
    });
    expect(tracked.length).toBe(2); // no UNFLAGGED, no CLEARED fabricated
  });
});

describe("listener wiring + cleanup", () => {
  it("fires PAGE_RELOADED on load only when previously visited, then TAB/WINDOW events", () => {
    vi.mocked(markAttemptVisited).mockReturnValue(true);
    mountHarness();
    expect(tracked).toEqual([["PAGE_RELOADED", undefined]]);

    act(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(tracked[1]).toEqual(["TAB_HIDDEN", undefined]);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(tracked[2]).toEqual(["WINDOW_FOCUS_LOST", undefined]);
  });

  it("removes every listener on unmount (no tracking after dispose)", () => {
    vi.mocked(markAttemptVisited).mockReturnValue(false);
    const { unmount } = mountHarness();
    unmount();

    act(() => {
      window.dispatchEvent(new Event("focus"));
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      useAnswerStore.getState().setAnswer(9, { selectedOptionKey: "a" });
    });
    expect(tracked).toEqual([]);
  });
});

describe("signal transitions", () => {
  it("first connect is silent; later drops/restores map to CONNECTION_LOST/RESTORED", () => {
    const { rerender } = mountHarness({ wsStatus: "connecting" });
    rerender(createElement(Harness, { attemptId: 1, clientInstanceId: "cid", wsStatus: "connected" }));
    expect(tracked).toEqual([]); // first-ever connect is not a restore

    rerender(createElement(Harness, { attemptId: 1, clientInstanceId: "cid", wsStatus: "disconnected" }));
    expect(tracked).toEqual([["CONNECTION_LOST", undefined]]);

    rerender(createElement(Harness, { attemptId: 1, clientInstanceId: "cid", wsStatus: "connected" }));
    expect(tracked[1]).toEqual(["CONNECTION_RESTORED", undefined]);
  });

  it("autosave error transitions emit AUTOSAVE_FAILED exactly once per failure", () => {
    const { rerender } = mountHarness({ autosaveStatus: "idle" });
    rerender(createElement(Harness, { attemptId: 1, clientInstanceId: "cid", autosaveStatus: "saving" }));
    rerender(createElement(Harness, { attemptId: 1, clientInstanceId: "cid", autosaveStatus: "error" }));
    expect(tracked).toEqual([["AUTOSAVE_FAILED", undefined]]);
    // Staying in error must not re-emit.
    rerender(createElement(Harness, { attemptId: 1, clientInstanceId: "cid", autosaveStatus: "error" }));
    expect(tracked.length).toBe(1);
  });
});
