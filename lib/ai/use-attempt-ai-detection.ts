"use client";

import { useEffect, useRef, useState } from "react";
import { attachTrack } from "@/lib/media/livekit";
import { getPublishedCameraTrack } from "@/lib/media/published-track";
import {
  ingestAiDetections,
  type AiDetectionEventType,
  type AiDetectionItem,
  type AiDetectionPayloadBox,
} from "@/lib/api/ai-detections";
import {
  MODEL,
  MIN_SCORE_EVENT,
  createDetector,
  type AiRuntime,
  type DetectionBox,
  type DetectionFrame,
  type Detector,
} from "./model-adapter";
import {
  createDetectionScheduler,
  DEFAULT_ANALYSIS_FPS,
  type DetectionScheduler,
} from "./detection-scheduler";
import {
  getFakeDetector,
  publishAiDroppedFrames,
  publishAiFrameSample,
  publishAiSentEvents,
  publishAiStatus,
  type SentAiEventRecord,
} from "./test-hooks";

/**
 * P4-C student-side AI detection (CONTRACT §6). Binds a hidden feeder
 * <video> to the CURRENTLY PUBLISHED camera track (raw getUserMedia or the
 * P4-B canvas re-encode fallback — both are just MediaStreamTracks with
 * decoded frames), runs the budgeted scheduler, decides observation events
 * client-side and batches them to the ingest API.
 *
 * HARD SAFETY: this hook NEVER writes shared state (autosave/submit are
 * untouched); every failure — model load, API, autoplay — degrades to its
 * own status only. CLIENT observations are never verdicts (ADR-008 D8).
 */

export type AttemptAiStatus =
  | "idle"
  | "loading"
  | "running"
  | "degraded"
  | "unavailable"
  | "released";

export interface AttemptAiState {
  status: AttemptAiStatus;
  runtime: AiRuntime | null;
  /** Current analysis FPS budget (pill copy). */
  fps: number;
  /** True while the e2e FAKE detector is active (output labeled SIMULATED). */
  simulated: boolean;
}

/** Batch bound per request (CONTRACT §3.1). */
const MAX_BATCH = 8;
/** Coalescing window before a partial batch is sent. */
const FLUSH_INTERVAL_MS = 2_000;
/** Poll cadence while waiting for the camera publish. */
const TRACK_POLL_MS = 1_000;
/** PERSON_NOT_OBSERVED needs 3 consecutive person-free analyzed frames. */
const PERSON_ABSENT_FRAMES = 3;

/* ------------------------------------------------------------------ */
/* Event decisions (pure — unit-tested).                               */
/* ------------------------------------------------------------------ */

export interface DetectionCounters {
  personAbsentStreak: number;
}

export interface FrameEvent {
  eventType: AiDetectionEventType;
  /** Only the boxes that drove the event (≤8). */
  detections: DetectionBox[];
}

export interface FrameDecision {
  events: FrameEvent[];
  counters: DetectionCounters;
}

/**
 * CONTRACT §6 decisions for one analyzed frame:
 * - phone: any cell-phone box ≥0.5 → PHONE_OBSERVED
 * - screen: any tv/laptop box ≥0.5 → SCREEN_OBSERVED
 * - multi: ≥2 person boxes ≥0.5 → MULTIPLE_PERSONS_OBSERVED (person boxes)
 * - person absent: 0 person boxes ≥0.4 on 3 CONSECUTIVE analyzed frames →
 *   PERSON_NOT_OBSERVED (streak resets on any person; each emitted event
 *   re-accumulates 3 more frames).
 *
 * parseModelOutput already keeps person boxes at ≥0.4, so `personsAny`
 * (no extra filter) is exactly the presence set.
 */
export function decideDetectionEvents(
  detections: DetectionBox[],
  prev: DetectionCounters
): FrameDecision {
  const phones = detections.filter(
    (d) => d.classId === 67 && d.confidence >= MIN_SCORE_EVENT
  );
  const screens = detections.filter(
    (d) => (d.classId === 62 || d.classId === 63) && d.confidence >= MIN_SCORE_EVENT
  );
  const personsEvent = detections.filter(
    (d) => d.classId === 0 && d.confidence >= MIN_SCORE_EVENT
  );
  const personsAny = detections.filter((d) => d.classId === 0);

  const streak = personsAny.length > 0 ? 0 : prev.personAbsentStreak + 1;
  const events: FrameEvent[] = [];
  if (phones.length > 0) events.push({ eventType: "PHONE_OBSERVED", detections: phones });
  if (screens.length > 0) events.push({ eventType: "SCREEN_OBSERVED", detections: screens });
  if (personsEvent.length >= 2) {
    events.push({ eventType: "MULTIPLE_PERSONS_OBSERVED", detections: personsEvent });
  }
  if (streak >= PERSON_ABSENT_FRAMES && streak % PERSON_ABSENT_FRAMES === 0) {
    events.push({ eventType: "PERSON_NOT_OBSERVED", detections: [] });
  }
  return { events, counters: { personAbsentStreak: streak } };
}

/** UUID with a stable fallback for non-secure contexts. */
function newEventId(sequence: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ai-${Date.now().toString(36)}-${sequence}`;
}

/** DetectionBox → wire payload box (tuple copy, no shared references). */
function toPayloadBoxes(boxes: DetectionBox[]): AiDetectionPayloadBox[] {
  return boxes.map((b) => ({
    classId: b.classId,
    label: b.label,
    confidence: b.confidence,
    bbox: [b.bbox[0], b.bbox[1], b.bbox[2], b.bbox[3]],
  }));
}

/* ------------------------------------------------------------------ */
/* Hook.                                                               */
/* ------------------------------------------------------------------ */

export function useAttemptAiDetection(
  attemptId: number,
  enabled = true
): AttemptAiState {
  const [state, setState] = useState<AttemptAiState>({
    status: "idle",
    runtime: null,
    fps: DEFAULT_ANALYSIS_FPS,
    simulated: false,
  });
  // Mirrors status for stable comparisons inside the effect.
  const statusRef = useRef<AttemptAiStatus>("idle");

  useEffect(() => {
    if (!enabled || !Number.isFinite(attemptId) || attemptId <= 0) return;
    let stopped = false;
    let scheduler: DetectionScheduler | null = null;
    let detector: Detector | null = null;
    let feeder: HTMLVideoElement | null = null;
    let trackPoll: ReturnType<typeof setTimeout> | undefined;
    let flushTimer: ReturnType<typeof setInterval> | undefined;
    let counters: DetectionCounters = { personAbsentStreak: 0 };
    let sequence = 0;
    let queue: AiDetectionItem[] = [];
    let sending = false;
    let simulated = false;
    const sentRecords: SentAiEventRecord[] = [];

    const enter = (next: AttemptAiStatus): void => {
      if (stopped) return;
      statusRef.current = next;
      publishAiStatus(next);
      setState((prev) => ({ ...prev, status: next }));
    };

    const MAX_LOCAL_RECORDS = 50;

    const recordSent = (batch: AiDetectionItem[]): void => {
      for (const item of batch) {
        sentRecords.push({
          eventId: item.eventId,
          eventType: item.eventType,
          sequence: item.sequence,
          simulated,
          observedAt: item.observedAt,
        });
      }
      if (sentRecords.length > MAX_LOCAL_RECORDS) {
        sentRecords.splice(0, sentRecords.length - MAX_LOCAL_RECORDS);
      }
      publishAiSentEvents([...sentRecords]);
    };

    /** Send the queue (≤8). Retry ×1 with the SAME eventIds (duplicate-safe);
     * final failure → 'degraded' ONLY — never throws to the caller. */
    const flush = async (): Promise<void> => {
      if (stopped || sending || queue.length === 0) return;
      sending = true;
      const batch = queue;
      queue = [];
      try {
        await ingestAiDetections(attemptId, batch);
        recordSent(batch);
        if (statusRef.current === "degraded") enter("running");
      } catch {
        try {
          await ingestAiDetections(attemptId, batch);
          recordSent(batch);
          if (statusRef.current === "degraded") enter("running");
        } catch {
          // Batch is dropped (bounded memory); detection keeps running.
          enter("degraded");
        }
      } finally {
        sending = false;
      }
    };

    // P2-5 (review): per-type client suppression so sustained detections
    // stay WELL under the server's 6 batches/min rate limit. Server-side
    // cooldowns (20s/45s) still aggregate; this only paces the wire.
    const lastQueuedAt: Record<string, number> = {};
    const EVENT_SUPPRESS_MS = 10_000;

    const handleFrame = (frame: DetectionFrame): void => {
      publishAiFrameSample({
        processingMs: frame.processingMs,
        frameWidth: frame.frameWidth,
        frameHeight: frame.frameHeight,
        runtime: frame.runtime,
        simulated: frame.simulated ?? false,
        at: frame.capturedAt,
        detectionCount: frame.detections.length,
      });
      const decision = decideDetectionEvents(frame.detections, counters);
      counters = decision.counters;
      const observedAt = new Date(frame.capturedAt).toISOString();
      const now = Date.now();
      for (const event of decision.events) {
        const last = lastQueuedAt[event.eventType] ?? 0;
        if (now - last < EVENT_SUPPRESS_MS) continue; // suppressed, not lost truth
        lastQueuedAt[event.eventType] = now;
        sequence += 1;
        queue.push({
          eventId: newEventId(sequence),
          eventType: event.eventType,
          observedAt,
          sequence,
          modelId: MODEL.id,
          modelVersion: MODEL.version,
          runtime: frame.runtime,
          frameWidth: frame.frameWidth,
          frameHeight: frame.frameHeight,
          processingMs: frame.processingMs,
          detections: toPayloadBoxes(event.detections),
        });
      }
      if (queue.length >= MAX_BATCH) void flush();
    };

    const waitForPublishedTrack = (): Promise<MediaStreamTrack | null> => {
      const { promise, resolve } = Promise.withResolvers<MediaStreamTrack | null>();
      const tryOnce = (): void => {
        if (stopped) {
          resolve(null);
          return;
        }
        const track = getPublishedCameraTrack();
        if (track) {
          resolve(track);
          return;
        }
        trackPoll = setTimeout(tryOnce, TRACK_POLL_MS);
      };
      tryOnce();
      return promise;
    };

    const teardown = (): void => {
      if (feeder) {
        feeder.pause();
        feeder.srcObject = null;
        feeder = null;
      }
      // The published track is NOT stopped here — its owner is the camera
      // hook (P4-B); AI only ever borrows it.
      scheduler?.stop();
      scheduler = null;
      const d = detector;
      detector = null;
      if (d) void d.release().catch(() => undefined);
    };

    const run = async (): Promise<void> => {
      enter("idle"); // waiting for the camera publish
      const track = await waitForPublishedTrack();
      if (stopped || !track) return;

      feeder = document.createElement("video");
      feeder.muted = true;
      feeder.playsInline = true;
      attachTrack(feeder, track);
      try {
        await feeder.play();
      } catch {
        // Autoplay/permission issues → honest 'unavailable'; the track
        // itself stays with its owner.
        feeder.srcObject = null;
        feeder = null;
        enter("unavailable");
        return;
      }
      if (stopped) {
        teardown();
        return;
      }

      enter("loading");
      // e2e seam: the FAKE detector is consulted FIRST when set (labeled
      // SIMULATED); otherwise the real onnxruntime-web adapter loads.
      const fake = getFakeDetector();
      if (fake) {
        simulated = true;
        setState((prev) => ({ ...prev, simulated: true }));
        detector = {
          status: "running",
          runtime: null,
          detect: (video) => Promise.resolve(fake(video)),
          release: async () => undefined,
        };
      } else {
        detector = await createDetector();
      }
      if (stopped) {
        teardown();
        return;
      }
      if (!detector || detector.status !== "running") {
        enter("unavailable");
        return;
      }
      const activeRuntime = detector.runtime;
      setState((prev) => ({ ...prev, runtime: activeRuntime }));

      const video = feeder;
      const activeDetector = detector;
      scheduler = createDetectionScheduler({
        detect: () => activeDetector.detect(video),
        onFrame: (frame) => {
          handleFrame(frame);
          publishAiDroppedFrames(scheduler?.droppedFrames ?? 0);
        },
        onStatus: (st) => {
          // P3-11 (review): keep the pill's FPS honest — mirror budget changes.
          setState((prev) => (prev.fps === st.fps ? prev : { ...prev, fps: st.fps }));
        },
      });
      scheduler.start();
      flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
      enter("running");
    };

    void run();

    return () => {
      stopped = true;
      clearTimeout(trackPoll);
      clearInterval(flushTimer);
      teardown();
      publishAiStatus("released");
      setState((prev) => ({ ...prev, status: "released" }));
    };
  }, [attemptId, enabled]);

  return state;
}
