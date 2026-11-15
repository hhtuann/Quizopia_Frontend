"use client";

import type { DetectionFrame } from "./model-adapter";

/**
 * P4-C detection scheduler (CONTRACT §6): bounded analysis budget over the
 * live camera track.
 *
 * Single-slot queue, latest-frame-wins: the analysis target is always the
 * feeder <video>'s CURRENT frame, so while one inference is in flight a new
 * tick does not queue work — it drops (`droppedFrames++`) and the next
 * analysis naturally sees the freshest frame.
 *
 * Adaptive FPS budget: EMA of processingMs; >1500ms → halve (floor 0.5 FPS);
 * <300ms sustained over 10 analyzed frames → raise (cap 3 FPS). The default
 * budget is 1.5 analysis FPS.
 *
 * NEVER on the autosave/submit path: `detect` failures degrade to the
 * status callback only — nothing here throws to the caller.
 */

export const DEFAULT_ANALYSIS_FPS = 1.5;
export const MIN_ANALYSIS_FPS = 0.5;
export const MAX_ANALYSIS_FPS = 3;
/** EMA of processingMs above this → halve the FPS budget. */
export const SLOW_EMA_MS = 1500;
/** processingMs below this counts toward a raise. */
export const FAST_FRAME_MS = 300;
/** Consecutive fast frames before raising the budget. */
export const FAST_STREAK_TO_RAISE = 10;
/** Frames between two budget adjustments (anti-oscillation). */
const FRAMES_BETWEEN_ADJUSTMENTS = 3;
/** EMA smoothing factor for processingMs. */
const EMA_ALPHA = 0.3;

export interface DetectionSchedulerOptions {
  /** Runs one analysis; resolves null when no frame is analyzable. */
  detect: () => Promise<DetectionFrame | null>;
  /** Invoked for every successfully analyzed frame. */
  onFrame: (frame: DetectionFrame) => void;
  /**
   * Honest telemetry surface: budget changes and non-fatal detect errors.
   * Never called with a thrown error — the scheduler swallows everything.
   */
  onStatus?: (status: {
    fps: number;
    reason: "adapt-slow" | "adapt-fast" | "detect-error";
    detail?: string;
  }) => void;
  /** Initial analysis FPS (default {@link DEFAULT_ANALYSIS_FPS}). */
  fps?: number;
}

export interface DetectionScheduler {
  start(): void;
  /** Cancels timers and drops the session ref. Idempotent. */
  stop(): void;
  /** Frames dropped because an analysis was still in flight. */
  readonly droppedFrames: number;
  /** Current analysis FPS budget. */
  readonly fps: number;
  readonly running: boolean;
}

export function createDetectionScheduler(
  options: DetectionSchedulerOptions
): DetectionScheduler {
  // Mutable so stop() can drop the session refs (detect/onFrame closures).
  let detect: DetectionSchedulerOptions["detect"] | undefined = options.detect;
  let onFrame: DetectionSchedulerOptions["onFrame"] | undefined = options.onFrame;
  let onStatus: DetectionSchedulerOptions["onStatus"] | undefined = options.onStatus;
  let fps = options.fps ?? DEFAULT_ANALYSIS_FPS;
  let running = false;
  let stopped = true;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let droppedFrames = 0;
  let emaMs: number | null = null;
  let fastStreak = 0;
  let framesSinceAdjustment = Number.POSITIVE_INFINITY;

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(tick, Math.round(1000 / fps));
  };

  const applyBudget = (nextFps: number, reason: "adapt-slow" | "adapt-fast"): void => {
    fps = nextFps;
    framesSinceAdjustment = 0;
    fastStreak = 0;
    onStatus?.({ fps, reason });
  };

  const adapt = (processingMs: number): void => {
    emaMs = emaMs == null ? processingMs : EMA_ALPHA * processingMs + (1 - EMA_ALPHA) * emaMs;
    if (processingMs < FAST_FRAME_MS) fastStreak += 1;
    else fastStreak = 0;

    framesSinceAdjustment += 1;
    if (framesSinceAdjustment < FRAMES_BETWEEN_ADJUSTMENTS) return;

    if (emaMs > SLOW_EMA_MS && fps > MIN_ANALYSIS_FPS) {
      applyBudget(Math.max(MIN_ANALYSIS_FPS, fps / 2), "adapt-slow");
      return;
    }
    if (fastStreak >= FAST_STREAK_TO_RAISE && fps < MAX_ANALYSIS_FPS) {
      applyBudget(Math.min(MAX_ANALYSIS_FPS, fps * 2), "adapt-fast");
    }
  };

  const tick = (): void => {
    if (stopped) return;
    if (busy) {
      // Latest-frame-wins: skip this tick — the next analysis reads the
      // freshest video frame anyway.
      droppedFrames += 1;
      schedule();
      return;
    }
    busy = true;
    // Cadence continues regardless of the in-flight analysis: while busy,
    // later ticks just count drops (latest-frame-wins).
    schedule();
    void (async () => {
      try {
        const frame = await detect?.();
        if (!stopped && frame) {
          adapt(frame.processingMs);
          onFrame?.(frame);
        }
      } catch (err) {
        // Never throw to the caller — degrade via the status callback only.
        onStatus?.({
          fps,
          reason: "detect-error",
          detail: err instanceof Error ? err.message : String(err),
        });
      } finally {
        busy = false;
      }
    })();
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      stopped = false;
      framesSinceAdjustment = Number.POSITIVE_INFINITY;
      schedule();
    },
    stop(): void {
      stopped = true;
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      // Drop the session refs so a late in-flight tick can never reach the
      // feeder or detector after stop().
      detect = undefined;
      onFrame = undefined;
      onStatus = undefined;
    },
    get droppedFrames() {
      return droppedFrames;
    },
    get fps() {
      return fps;
    },
    get running() {
      return running;
    },
  };
}
