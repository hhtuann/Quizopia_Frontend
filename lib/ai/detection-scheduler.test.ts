// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDetectionScheduler,
  DEFAULT_ANALYSIS_FPS,
  MIN_ANALYSIS_FPS,
  MAX_ANALYSIS_FPS,
} from "./detection-scheduler";
import type { DetectionFrame } from "./model-adapter";

/**
 * P4-C scheduler (CONTRACT §7): drop-old single slot, adaptive FPS budget,
 * stop cleanup. Fake timers drive the ticks; a detect() REJECTION must
 * degrade to the status callback — never throw to the caller.
 */

function frame(processingMs: number): DetectionFrame {
  return {
    detections: [],
    frameWidth: 1280,
    frameHeight: 720,
    processingMs,
    capturedAt: Date.now(),
    runtime: "ORT_WEB_WASM",
  };
}

function deferredDetect(): {
  detect: () => Promise<DetectionFrame | null>;
  resolveFrame: (f: DetectionFrame) => void;
} {
  let resolve: (f: DetectionFrame | null) => void = () => undefined;
  const promise = new Promise<DetectionFrame | null>((res) => {
    resolve = res;
  });
  return { detect: () => promise, resolveFrame: resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const TICK_MS = Math.round(1000 / DEFAULT_ANALYSIS_FPS);

describe("detection scheduler", () => {
  it("analyzes at the budget cadence and emits frames", async () => {
    const onFrame = vi.fn();
    const s = createDetectionScheduler({
      detect: async () => frame(100),
      onFrame,
    });
    s.start();
    await vi.advanceTimersByTimeAsync(TICK_MS - 1);
    expect(onFrame).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onFrame).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(onFrame).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("drops ticks while an analysis is in flight (latest frame wins)", async () => {
    const { detect, resolveFrame } = deferredDetect();
    const s = createDetectionScheduler({ detect, onFrame: () => undefined });
    s.start();
    await vi.advanceTimersByTimeAsync(TICK_MS); // first tick starts, pending
    await vi.advanceTimersByTimeAsync(TICK_MS * 3); // 3 ticks while busy
    expect(s.droppedFrames).toBe(3);
    resolveFrame(frame(50));
    await vi.advanceTimersByTimeAsync(0);
    // The pending analysis resolves exactly once; next tick analyzes again.
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(s.droppedFrames).toBeGreaterThanOrEqual(3);
    s.stop();
  });

  it("halves the FPS budget when EMA processingMs exceeds 1500 (floor 0.5)", async () => {
    const onStatus = vi.fn();
    const s = createDetectionScheduler({
      detect: async () => frame(2000),
      onFrame: () => undefined,
      onStatus,
    });
    s.start();
    // Frame 1: EMA 2000 > 1500 → 1.5 → 0.75 (after ≥3-frame gap satisfied
    // on the very first frame via the initial Infinity).
    await vi.advanceTimersByTimeAsync(Math.round(1000 / 1.5));
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "adapt-slow", fps: 0.75 })
    );
    // Frames 2..4 at 0.75 FPS; the 3-frame gap elapses → 0.5 (floor).
    await vi.advanceTimersByTimeAsync(Math.round(1000 / 0.75) * 4);
    expect(s.fps).toBe(MIN_ANALYSIS_FPS);
    // Stay at the floor — never below.
    await vi.advanceTimersByTimeAsync(Math.round(1000 / 0.5) * 6);
    expect(s.fps).toBe(MIN_ANALYSIS_FPS);
    s.stop();
  });

  it("raises the FPS budget after 10 consecutive fast frames (cap 3)", async () => {
    const s = createDetectionScheduler({
      detect: async () => frame(100),
      onFrame: () => undefined,
    });
    s.start();
    for (let i = 0; i < 11; i++) {
      await vi.advanceTimersByTimeAsync(Math.round(1000 / s.fps));
    }
    expect(s.fps).toBe(MAX_ANALYSIS_FPS);
    // Cap holds — no further raises.
    await vi.advanceTimersByTimeAsync(Math.round(1000 / MAX_ANALYSIS_FPS) * 5);
    expect(s.fps).toBe(MAX_ANALYSIS_FPS);
    s.stop();
  });

  it("never throws: a rejecting detect() degrades to the status callback", async () => {
    const onStatus = vi.fn();
    const s = createDetectionScheduler({
      detect: () => Promise.reject(new Error("wasm died")),
      onFrame: () => undefined,
      onStatus,
    });
    s.start();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "detect-error", detail: "wasm died" })
    );
    s.stop();
  });

  it("stop() cancels timers and drops the session — no further ticks", async () => {
    const onFrame = vi.fn();
    const s = createDetectionScheduler({
      detect: async () => frame(50),
      onFrame,
    });
    s.start();
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(onFrame).toHaveBeenCalledTimes(1);
    s.stop();
    expect(s.running).toBe(false);
    await vi.advanceTimersByTimeAsync(TICK_MS * 10);
    expect(onFrame).toHaveBeenCalledTimes(1); // nothing more
  });

  it("stop() is idempotent", () => {
    const s = createDetectionScheduler({
      detect: async () => frame(1),
      onFrame: () => undefined,
    });
    s.start();
    s.stop();
    s.stop();
    expect(s.running).toBe(false);
  });
});
