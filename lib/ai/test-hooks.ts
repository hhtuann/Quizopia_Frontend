import type { DetectionFrame } from "./model-adapter";
import type { Detector } from "./model-adapter";

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
  /** Per-analyzed-frame telemetry (last 500) — benchmark surface. */
  getFrameSamples(): AiFrameSample[];
  /**
   * The REAL detector factory (dynamic ort-web load) — benchmark surface
   * for driving the real model against any video element. Never returns a
   * fake; output is real-model output.
   */
  createRealDetector(): Promise<Detector>;
}

/** One analyzed frame's honest telemetry (benchmark + debugging). */
export interface AiFrameSample {
  processingMs: number;
  frameWidth: number;
  frameHeight: number;
  runtime: string;
  simulated: boolean;
  at: number;
  /** Detections above threshold this frame (count only). */
  detectionCount: number;
}

const MAX_SENT_RECORDS = 50;
const MAX_FRAME_SAMPLES = 500;

let fakeDetector: FakeDetectorFn | null = null;
let status = "idle";
let droppedFrames = 0;
let sentEvents: SentAiEventRecord[] = [];
let frameSamples: AiFrameSample[] = [];

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
      getFrameSamples: () => [...frameSamples],
      createRealDetector: async () => {
        // Local dynamic import: keeps ort-web out of the page bundle until
        // a benchmark explicitly requests the real detector (runtime-selected
        // module — static import would ship 30MB of wasm to every visitor).
        const mod = await import("./model-adapter");
        return mod.createDetector();
      },
    };
  }
}

/** Test/hook seam: the fake consulted FIRST by the real hook, or null. */
export function getFakeDetector(): FakeDetectorFn | null {
  return fakeDetector;
}

// Dev/test builds expose the (empty) registry at module load so the e2e
// benchmark can drive the REAL detector from any page without an attempt.
if (process.env.NODE_ENV !== "production") exposeHooks();

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

/** Internal (hook → hooks): one analyzed frame's telemetry. No-op in prod. */
export function publishAiFrameSample(sample: AiFrameSample): void {
  if (process.env.NODE_ENV === "production") return;
  frameSamples = [...frameSamples.slice(-(MAX_FRAME_SAMPLES - 1)), sample];
  exposeHooks();
}

/** Unit-test seam: reset the module registries between cases. */
export function resetAiTestHooks(): void {
  fakeDetector = null;
  status = "idle";
  droppedFrames = 0;
  sentEvents = [];
  frameSamples = [];
}
