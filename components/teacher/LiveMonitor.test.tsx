// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveMonitor } from "./LiveMonitor";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * FE-3 regression: after a WS reconnect, LiveMonitor must run its own
 * invalidations AND forward to the caller's `onReconnect` — the session
 * detail uses that hook to backfill the selected attempt's timeline (events
 * that landed while the socket was down; REST is the source of truth).
 */

const callbacks: {
  reconnect?: () => void;
  participantStarted?: (ev: RealtimeEventEnvelope) => void;
  attemptActivity?: (ev: RealtimeEventEnvelope) => void;
} = {};

vi.mock("@/lib/realtime/use-session-events", () => ({
  useSessionEvents: vi.fn(
    (
      _sessionId: number,
      _initial: unknown,
      onReconnect?: () => void,
      onParticipantStarted?: (ev: RealtimeEventEnvelope) => void,
      onAttemptActivity?: (ev: RealtimeEventEnvelope) => void
    ) => {
      callbacks.reconnect = onReconnect;
      callbacks.participantStarted = onParticipantStarted;
      callbacks.attemptActivity = onAttemptActivity;
      return {
        status: "connected" as const,
        metrics: {
          activeCount: 0,
          startedCount: 0,
          submittedCount: 0,
          sessionStatus: "OPEN",
        },
        recentEvents: [],
      };
    }
  ),
}));

const invalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/hooks/queries/use-exam-sessions", () => ({
  useSessionRosterQuery: () => ({ data: [] }),
}));

vi.mock("./ParticipantModeration", () => ({
  ParticipantModeration: () => null,
}));

vi.mock("./AiAlertFeed", () => ({
  AiAlertFeed: () => null,
  isAiAlertActivity: (ev: { activityType?: string | null }) =>
    ev.activityType != null && ev.activityType.startsWith("AI_ALERT_"),
}));

beforeEach(() => {
  invalidateQueries.mockReset();
});

afterEach(cleanup);

describe("LiveMonitor reconnect forwarding (FE-3)", () => {
  it("reconnect invalidates session keys and calls onReconnect for the timeline backfill", () => {
    const onReconnect = vi.fn();
    render(
      <LiveMonitor
        sessionId={5}
        initial={{
          activeCount: 0,
          startedCount: 0,
          submittedCount: 0,
          sessionStatus: "OPEN",
        }}
        onReconnect={onReconnect}
      />
    );

    expect(callbacks.reconnect).toBeTypeOf("function");
    callbacks.reconnect!();

    expect(onceFor(["exam-sessions", 5, "detail"])).toBe(true);
    expect(onceFor(["exam-sessions", 5, "participants"])).toBe(true);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("tolerates an absent onReconnect (older call sites)", () => {
    render(
      <LiveMonitor
        sessionId={5}
        initial={{
          activeCount: 0,
          startedCount: 0,
          submittedCount: 0,
          sessionStatus: "OPEN",
        }}
      />
    );
    expect(() => callbacks.reconnect!()).not.toThrow();
  });
});

function onceFor(key: unknown[]): boolean {
  return (
    invalidateQueries.mock.calls.filter((call) =>
      JSON.stringify(call[0]?.queryKey) === JSON.stringify(key)
    ).length === 1
  );
}
