import type { DetectionFrame } from "./model-adapter";

/**
 * P4-C AI test hooks (mirrors lib/media/test-hooks.ts). e2e (Playwright) and
 * unit tests drive a deterministic FAKE detector and observe the AI session
 * through `window.__quizopiaAi` — production builds never populate the fake
 * (the registry getters still work; nothing sets them outside tests).
 *
 * Fake output is labeled SIMULATED everywhere it appears: the injected frame
 * carries `simulated: true`, the hook's status exposes it, and the student
 * pill appends " [SIMULATED]" while a fake is active.
 */

export type FakeDetectorFn = (
  video: HTMLVideoElement
) => Promise<DetectionFrame | null> | DetectionFrame | null;

export interface SentAiEventRecord {
  eventId: string;
  eventType: string;
  sequence: number;
  simulated: boolean;
  observedAt: string;
}

export interface QuizopiaAiTestHooks {
  /**
   * Inject a deterministic FAKE detector (labeled SIMULATED) or restore the
   * real adapter with null. The hook consults the fake FIRST when set.
   */
  setFakeDetector(fn: FakeDetectorFn | null): void;
  /** Current AI session status (idle|loading|running|degraded|unavailable|released). */
  getStatus(): string;
  /** Frames dropped by the scheduler (busy ticks) so far. */
  getDroppedFrames(): number;
  /** Event batches actually sent (last 50) — most recent last. */
  getSentEvents(): SentAiEventRecord[];
}

const MAX_SENT_RECORDS = 50;

let fakeDetector: FakeDetectorFn | null = null;
let status = "idle";
let droppedFrames = 0;
let sentEvents: SentAiEventRecord[] = [];

declare global {
  var __quizopiaAi: QuizopiaAiTestHooks | undefined;
}

function exposeHooks(): void {
  if (typeof globalThis.__quizopiaAi === "undefined") {
    globalThis.__quizopiaAi = {
      setFakeDetector: (fn) => {
        if (process.env.NODE_ENV === "production") return;
        fakeDetector = fn;
      },
      getStatus: () => status,
      getDroppedFrames: () => droppedFrames,
      getSentEvents: () => [...sentEvents],
    };
  }
}

/** Test/hook seam: the fake consulted FIRST by the real hook, or null. */
export function getFakeDetector(): FakeDetectorFn | null {
  return fakeDetector;
}

/** Unit-test seam (vitest) — same registry the global writes. */
export function setFakeDetectorForTest(fn: FakeDetectorFn | null): void {
  fakeDetector = fn;
}

/** Internal (hook → hooks) telemetry publications. No-op in production. */
export function publishAiStatus(next: string): void {
  if (process.env.NODE_ENV === "production") return;
  status = next;
  exposeHooks();
}

export function publishAiDroppedFrames(total: number): void {
  if (process.env.NODE_ENV === "production") return;
  droppedFrames = total;
}

export function publishAiSentEvents(records: SentAiEventRecord[]): void {
  if (process.env.NODE_ENV === "production") return;
  sentEvents = records.slice(-MAX_SENT_RECORDS);
}

/** Unit-test seam: reset the module registries between cases. */
export function resetAiTestHooks(): void {
  fakeDetector = null;
  status = "idle";
  droppedFrames = 0;
  sentEvents = [];
}
