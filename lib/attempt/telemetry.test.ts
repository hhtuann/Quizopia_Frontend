import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attemptVisitKey,
  createAttemptTelemetry,
  markAttemptVisited,
  resetAttemptTelemetry,
  telemetryRetryDelayMs,
  type TelemetrySendFn,
} from "./telemetry";
import type {
  ActivityEventInput,
  IngestActivityEventsResponse,
} from "@/lib/api/monitoring";

/**
 * Telemetry queue logic (P4-A). The emitter is exercised with an injected
 * `send` + fake timers — no network, no jsdom. `resetAttemptTelemetry`
 * disposes the module singleton between cases.
 */

function ok(): IngestActivityEventsResponse {
  return { acceptedCount: 1, duplicateCount: 0, results: [] };
}

function sendFn(
  impl: (events: ActivityEventInput[]) => void | Promise<unknown> = () => {}
): TelemetrySendFn {
  return vi.fn(async (_attemptId: number, events: ActivityEventInput[]) => {
    await impl(events);
    return ok();
  }) as unknown as TelemetrySendFn;
}

/** A normalized-ish 429 with a Retry-After header on the raw axios error. */
function rateLimited(retryAfter: string): unknown {
  return {
    kind: "api",
    status: 429,
    code: "MONITORING_RATE_LIMITED",
    message: "rate limited",
    raw: {
      isAxiosError: true,
      response: { status: 429, headers: { "retry-after": retryAfter } },
    },
  };
}

function sentTypes(send: TelemetrySendFn): string[] {
  const calls = (send as unknown as ReturnType<typeof vi.fn>).mock.calls as [
    number,
    ActivityEventInput[],
  ][];
  return calls.flatMap(([, events]) => events.map((e) => e.eventType));
}

function sentEvents(send: TelemetrySendFn): ActivityEventInput[] {
  const calls = (send as unknown as ReturnType<typeof vi.fn>).mock.calls as [
    number,
    ActivityEventInput[],
  ][];
  return calls.flatMap(([, events]) => events);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAttemptTelemetry();
});

afterEach(() => {
  resetAttemptTelemetry();
  vi.useRealTimers();
});

describe("createAttemptTelemetry singleton", () => {
  it("returns the same live instance for the same attempt (no dupes on rerender)", () => {
    const a = createAttemptTelemetry(7);
    const b = createAttemptTelemetry(7);
    expect(b).toBe(a);
  });
  it("disposes the previous instance when a different attempt starts", () => {
    const send = sendFn();
    const a = createAttemptTelemetry(7, { send, flushThreshold: 100 });
    a.track("TAB_HIDDEN");
    const b = createAttemptTelemetry(8, { send, flushThreshold: 100 });
    expect(b).not.toBe(a);
    // Disposing drained a's queued event (best-effort final send, attempt 7).
    const calls = (send as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      number,
      ActivityEventInput[],
    ][];
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(7);
    expect(calls[0][1].map((e) => e.eventType)).toEqual(["TAB_HIDDEN"]);
    // Disposed instance ignores new tracks (nothing queues for b either).
    a.track("TAB_VISIBLE");
    expect(a.getStats().queued).toBe(0);
    expect(b.getStats().queued).toBe(0);
  });
});

describe("queue bounds + flush triggers", () => {
  it("flushes when the threshold is reached with unique ids + monotonic sequences", async () => {
    const send = sendFn();
    const t = createAttemptTelemetry(1, { send, flushThreshold: 20 });
    for (let i = 0; i < 20; i++) t.track("TAB_VISIBLE");

    await vi.advanceTimersByTimeAsync(0);
    const events = sentEvents(send);
    expect(events).toHaveLength(20);
    expect(new Set(events.map((e) => e.eventId)).size).toBe(20);
    expect(events.map((e) => e.clientSequence)).toEqual(
      Array.from({ length: 20 }, (_, i) => i)
    );
    expect(t.getStats().sent).toBe(20);
  });

  it("flushes on the interval timer before the threshold", async () => {
    const send = sendFn();
    const t = createAttemptTelemetry(1, { send, flushIntervalMs: 3000 });
    t.track("TAB_HIDDEN");
    expect((send as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(3000);
    expect(sentTypes(send)).toEqual(["TAB_HIDDEN"]);
    expect(t.getStats().queued).toBe(0);
  });

  it("drops the OLDEST events past the bound and reports the counter", async () => {
    const send = sendFn();
    const t = createAttemptTelemetry(1, {
      send,
      maxQueue: 5,
      flushThreshold: 100,
    });
    for (let i = 0; i < 8; i++) t.track("TAB_VISIBLE");
    expect(t.getStats().queued).toBe(5);
    expect(t.getStats().dropped).toBe(3);

    await t.flush();
    // drain() is async — let microtasks settle.
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getStats().sent).toBe(5);
    expect(t.getStats().queued).toBe(0);
  });

  it("chunks a large queue into <=25-event batches (server batch limit)", async () => {
    const send = sendFn();
    const t = createAttemptTelemetry(1, { send, flushThreshold: 60 });
    for (let i = 0; i < 60; i++) t.track("TAB_VISIBLE");

    await vi.advanceTimersByTimeAsync(0);
    const calls = (send as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      number,
      ActivityEventInput[],
    ][];
    expect(calls.map(([, events]) => events.length)).toEqual([25, 25, 10]);
  });
});

describe("retry policy", () => {
  it("retries with the SAME eventIds and succeeds within 3 attempts", async () => {
    let failures = 0;
    const send = vi.fn(async (_id: number, events: ActivityEventInput[]) => {
      if (failures < 2) {
        failures += 1;
        throw new Error("network down");
      }
      return { acceptedCount: events.length, duplicateCount: 0, results: [] };
    }) as unknown as TelemetrySendFn;

    const t = createAttemptTelemetry(1, { send, flushThreshold: 1 });
    t.track("TAB_HIDDEN");

    await vi.advanceTimersByTimeAsync(0); // attempt 1 fails → 1s backoff
    await vi.advanceTimersByTimeAsync(1000); // attempt 2 fails → 2s backoff
    await vi.advanceTimersByTimeAsync(2000); // attempt 3 succeeds

    const calls = (send as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      number,
      ActivityEventInput[],
    ][];
    expect(calls).toHaveLength(3);
    const ids = calls.map(([, events]) => events.map((e) => e.eventId));
    expect(ids[1]).toEqual(ids[0]);
    expect(ids[2]).toEqual(ids[0]);
    expect(t.getStats().sent).toBe(1);
  });
  it("drops the batch after 3 failed attempts per batch (no 4th send)", async () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as TelemetrySendFn;

    const t = createAttemptTelemetry(1, { send, flushThreshold: 1 });
    t.track("TAB_HIDDEN");
    t.track("TAB_VISIBLE");

    // Two batches × (1s + 2s) backoff between their 3 attempts each.
    await vi.advanceTimersByTimeAsync(7000);
    expect((send as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(6);
    expect(t.getStats().dropped).toBe(2);
    expect(t.getStats().failedBatches).toBe(2);
    expect(t.getStats().queued).toBe(0);
  });

  it("honours Retry-After seconds (capped at 60s) on 429", async () => {
    const attempts: number[] = [];
    const send = vi.fn(async () => {
      attempts.push(Date.now());
      if (attempts.length === 1) throw rateLimited("5");
      return ok();
    }) as unknown as TelemetrySendFn;

    const t = createAttemptTelemetry(1, { send, flushThreshold: 1 });
    t.track("TAB_HIDDEN");

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4999);
    expect(attempts).toHaveLength(1); // still backing off
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toHaveLength(2); // fired exactly at Retry-After
    expect(t.getStats().sent).toBe(1);
  });

  it("telemetryRetryDelayMs caps Retry-After at 60s and falls back exponentially", () => {
    expect(telemetryRetryDelayMs(rateLimited("120"), 1)).toBe(60_000);
    expect(telemetryRetryDelayMs(rateLimited("2"), 1)).toBe(2_000);
    expect(telemetryRetryDelayMs(new Error("x"), 1)).toBe(1_000);
    expect(telemetryRetryDelayMs(new Error("x"), 2)).toBe(2_000);
    expect(telemetryRetryDelayMs(undefined, 1)).toBe(1_000);
  });
});

describe("metadata + dispose", () => {
  it("drops oversized metadata but still sends the event", async () => {
    const send = sendFn();
    const t = createAttemptTelemetry(1, { send, flushThreshold: 1 });
    t.track("ANSWER_SELECTED", { questionId: 3 });
    t.track("ANSWER_CHANGED", { blob: "x".repeat(3000) });

    await vi.advanceTimersByTimeAsync(0);
    const events = sentEvents(send);
    expect(events[0].metadata).toEqual({ questionId: 3 });
    expect(events[1].metadata).toBeUndefined();
  });

  it("stops the interval on dispose; tracked events afterwards are ignored", async () => {
    const send = sendFn();
    const t = createAttemptTelemetry(1, { send, flushIntervalMs: 3000 });
    t.dispose();
    t.track("TAB_HIDDEN");

    await vi.advanceTimersByTimeAsync(10_000);
    expect((send as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe("PAGE_RELOADED visit marker", () => {
  it("flags a reload only when a PREVIOUS page load left the marker", () => {
    const store = {
      [attemptVisitKey(42)]: "1",
    } as Record<string, string>;
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    vi.stubGlobal("sessionStorage", storage);

    // Fresh module session + stored flag → the student reloaded.
    resetAttemptTelemetry();
    expect(markAttemptVisited(42)).toBe(true);
    // Same SPA session (remount) → NOT a reload.
    expect(markAttemptVisited(42)).toBe(false);
    // Brand-new attempt, no marker → not a reload, marker now set.
    expect(markAttemptVisited(43)).toBe(false);
    expect(markAttemptVisited(43)).toBe(false);

    vi.unstubAllGlobals();
  });
});
