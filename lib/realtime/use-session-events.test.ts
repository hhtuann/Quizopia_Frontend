// @vitest-environment jsdom
import { createElement, useEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@stomp/stompjs";
import { useSessionEvents } from "./use-session-events";
import type { RealtimeEventEnvelope } from "./types";

/**
 * P4-B (additive): the ATTEMPT_ACTIVITY diversion the camera grid relies on —
 * CAMERA_/MONITORING_GAP activity must reach `onAttemptActivity` (the page
 * invalidates `["exam-sessions", id, "camera-status"]` from there) and must
 * NEVER enter the capped lifecycle feed. The STOMP layer is mocked so the
 * subscription callback can be driven directly.
 *
 * (.ts, not .tsx — the vitest include globs only pick ".ts" under lib; the
 * harness uses createElement instead of JSX.)
 */

let pushMessage: ((body: string) => void) | null = null;

vi.mock("./use-stomp-connection", () => ({
  useStompConnection: () => ({
    status: "connected" as const,
    client: {
      subscribe: (_destination: string, cb: (msg: { body: string }) => void) => {
        pushMessage = (body: string) => cb({ body });
        return { unsubscribe: vi.fn() };
      },
    } as unknown as Client,
  }),
}));

type Result = ReturnType<typeof useSessionEvents>;

// Latest hook result, captured in an effect (React Compiler forbids
// mutating props; tests read this after act() flushes effects).
let eventsResult: Result | null = null;

function Harness(props: { onAttemptActivity?: (ev: RealtimeEventEnvelope) => void }) {
  const events = useSessionEvents(
    5,
    { activeCount: 0, startedCount: 0, submittedCount: 0, sessionStatus: "OPEN" },
    undefined,
    undefined,
    props.onAttemptActivity
  );
  useEffect(() => {
    eventsResult = events;
  }, [events]);
  return null;
}

const activityEnvelope = (activityType: string): RealtimeEventEnvelope => ({
  eventId: `e-${activityType}`,
  eventType: "ATTEMPT_ACTIVITY",
  sessionId: 5,
  attemptId: 7,
  userId: 11,
  occurredAt: "2026-11-14T09:00:00Z",
  serverTime: "2026-11-14T09:00:00Z",
  activityType,
  activitySource: "SERVER",
});

function mount() {
  eventsResult = null;
  const onAttemptActivity = vi.fn();
  render(createElement(Harness, { onAttemptActivity }));
  return { onAttemptActivity };
}

afterEach(() => {
  pushMessage = null;
  cleanup();
});

describe("useSessionEvents ATTEMPT_ACTIVITY diversion", () => {
  it("delivers CAMERA_* activity to onAttemptActivity, never to the feed", () => {
    const { onAttemptActivity } = mount();
    act(() => {
      pushMessage?.(JSON.stringify(activityEnvelope("CAMERA_CONNECTED")));
    });
    expect(onAttemptActivity).toHaveBeenCalledTimes(1);
    expect(onAttemptActivity.mock.calls[0][0].activityType).toBe("CAMERA_CONNECTED");
    expect(eventsResult?.recentEvents).toHaveLength(0);
  });

  it("delivers MONITORING_GAP activity the same way", () => {
    const { onAttemptActivity } = mount();
    act(() => {
      pushMessage?.(JSON.stringify(activityEnvelope("MONITORING_GAP")));
    });
    expect(onAttemptActivity).toHaveBeenCalledTimes(1);
    expect(onAttemptActivity.mock.calls[0][0].activityType).toBe("MONITORING_GAP");
  });

  it("keeps lifecycle events in the feed and out of onAttemptActivity", () => {
    const { onAttemptActivity } = mount();
    act(() => {
      pushMessage?.(
        JSON.stringify({
          eventId: "e2",
          eventType: "ATTEMPT_STARTED",
          sessionId: 5,
          attemptId: 8,
          userId: 12,
          occurredAt: "2026-11-14T09:01:00Z",
          serverTime: "2026-11-14T09:01:00Z",
          activeCount: 1,
        } satisfies RealtimeEventEnvelope)
      );
    });
    expect(onAttemptActivity).not.toHaveBeenCalled();
    expect(eventsResult?.recentEvents).toHaveLength(1);
    expect(eventsResult?.metrics.startedCount).toBe(1);
  });

  it("ignores malformed frames", () => {
    const { onAttemptActivity } = mount();
    act(() => {
      pushMessage?.("{not json");
    });
    expect(onAttemptActivity).not.toHaveBeenCalled();
    expect(eventsResult?.recentEvents).toHaveLength(0);
  });

  it("tolerates an absent onAttemptActivity subscriber", () => {
    render(createElement(Harness));
    expect(() =>
      act(() => {
        pushMessage?.(JSON.stringify(activityEnvelope("CAMERA_REVOKED")));
      })
    ).not.toThrow();
  });
});

