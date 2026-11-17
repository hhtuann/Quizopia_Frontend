"use client";

import { useEffect, useRef, useState } from "react";
import { attachTrack } from "@/lib/media/livekit";
import { getPublishedCameraTrack } from "@/lib/media/published-track";
import {
  fetchAttemptMediaStatus,
  uploadEvidenceSnapshot,
} from "@/lib/api/evidence";
import {
  ingestAiDetections,
  type AiDetectionEventType,
  type AiDetectionIngestResult,
  type AiDetectionItem,
  type AiDetectionPayloadBox,
  type AiDetectionSnapshotRequest,
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
  GAZE_ENABLED,
  GAZE_MODEL,
  createGazeEstimator,
  type GazeEstimator,
} from "./gaze-adapter";
import {
  GAZE_FACE_CLASS_ID,
  GazeTracker,
  formatGazeLabel,
  type GazeObservation,
  type GazeReport,
} from "./gaze-core";
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

/**
 * Gaze sub-pipeline state (independent of the object detector):
 * off = not started / disabled; loading = models downloading;
 * calibrating = collecting the on-screen baseline; running = tracking.
 */
export type AttemptGazeStatus =
  | "off"
  | "loading"
  | "calibrating"
  | "running"
  | "unavailable";

export interface AttemptAiState {
  status: AttemptAiStatus;
  /** Gaze estimator state — its failure never affects `status`. */
  gaze: AttemptGazeStatus;
  runtime: AiRuntime | null;
  /** Current analysis FPS budget (pill copy). */
  fps: number;
  /** True while the e2e FAKE detector is active (output labeled SIMULATED). */
  simulated: boolean;
  /**
   * P4-D snapshot upload (transient pill copy): 'sent' after a successful
   * CLIENT_CAPTURE upload, 'failed' when capture/upload failed. NEVER
   * affects the detection loop.
   */
  snapshotState: AttemptSnapshotState;
}

export type AttemptSnapshotState = "idle" | "sent" | "failed";

/** Batch bound per request (CONTRACT §3.1). */
const MAX_BATCH = 8;
/** Backend contract: at most 8 boxes per event payload. */
const MAX_PAYLOAD_BOXES = 8;
/** Coalescing window before a partial batch is sent. */
const FLUSH_INTERVAL_MS = 2_000;
/**
 * Minimum gap between two batch sends. Five event types, each paced at one
 * per 10s, can otherwise stagger into far more than the server's 6
 * batches/min (e.g. a phone held low: PHONE + LOOKING_AWAY together) and
 * get 429-dropped. A full batch still goes out immediately.
 */
const MIN_FLUSH_GAP_MS = 11_000;
/** Consecutive gaze failures before the gaze estimator is given up on. */
const GAZE_MAX_FAILURES = 3;
/** Poll cadence while waiting for the camera publish. */
const TRACK_POLL_MS = 1_000;
/** PERSON_NOT_OBSERVED needs 3 consecutive person-free analyzed frames. */
const PERSON_ABSENT_FRAMES = 3;
/** P4-D snapshot: longest captured side (no upscaling — mirrors the
 * camera-fallback canvas sizing). */
const SNAPSHOT_MAX_SIDE = 640;
/** P4-D snapshot JPEG quality (≤2MB contract bound). */
const SNAPSHOT_JPEG_QUALITY = 0.85;

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

/**
 * The payload box for a looking-away report: the test taker's face box
 * (normalized), face-detector score as confidence, and the direction +
 * deviation encoded in the label (`gaze:<direction>:<yaw>:<pitch>`).
 * Null when the frame has no face box or no direction to report.
 */
export function gazeEventBox(
  report: GazeReport,
  obs: GazeObservation
): DetectionBox | null {
  if (!obs.faceBox || obs.faceScore == null) return null;
  const direction = report.kind === "frequent" ? "frequent" : report.direction;
  if (!direction) return null;
  return {
    classId: GAZE_FACE_CLASS_ID,
    label: formatGazeLabel({
      direction,
      deltaYaw: report.deltaYaw,
      deltaPitch: report.deltaPitch,
    }),
    confidence: obs.faceScore,
    bbox: [obs.faceBox[0], obs.faceBox[1], obs.faceBox[2], obs.faceBox[3]],
  };
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
  // Backend rejects >8 boxes per event (400) — cap here so a freak frame
  // (e.g. 9 person boxes) can never 400-loop the batch pipeline.
  return boxes.slice(0, MAX_PAYLOAD_BOXES).map((b) => ({
    classId: b.classId,
    label: b.label,
    confidence: b.confidence,
    bbox: [b.bbox[0], b.bbox[1], b.bbox[2], b.bbox[3]],
  }));
}

/** P4-D idempotency key — fresh UUID per capture intent. */
function newSnapshotKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * P4-D: capture the feeder's CURRENT frame as a JPEG blob. Sizing mirrors
 * the camera-fallback canvas (decoded videoWidth/videoHeight, max side
 * SNAPSHOT_MAX_SIDE, never upscaled). Resolves null when no frame has
 * decoded or the environment cannot encode.
 */
function captureSnapshotBlob(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, SNAPSHOT_MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { promise, resolve } = Promise.withResolvers<Blob | null>();
  canvas.toBlob(resolve, "image/jpeg", SNAPSHOT_JPEG_QUALITY);
  return promise;
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
    gaze: "off",
    runtime: null,
    fps: DEFAULT_ANALYSIS_FPS,
    simulated: false,
    snapshotState: "idle",
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
    let gazeEstimator: GazeEstimator | null = null;
    let gazeFailures = 0;
    let lastFlushAt = Number.NEGATIVE_INFINITY;
    const gazeTracker = new GazeTracker();
    // P4-D snapshot policy. Requests arriving while the policy is UNKNOWN
    // are buffered, never dropped: resolve → on (upload), off (drop), or
    // fetch-failure → attempt anyway (the server policy gate is the honest
    // authority and rejects cleanly).
    let snapshotPolicy: "unknown" | "on" | "off" | "attempt" = "unknown";
    const pendingSnapshotRequests: AiDetectionSnapshotRequest[] = [];
    /** Capture + upload one snapshot. Fire-and-forget — a failure ONLY
     * flips snapshotState, never the detection loop. */
    const uploadSnapshot = (request: AiDetectionSnapshotRequest): void => {
      const video = feeder;
      void (async () => {
        try {
          const blob = video ? await captureSnapshotBlob(video) : null;
          if (blob == null) throw new Error("snapshot frame unavailable");
          await uploadEvidenceSnapshot(attemptId, {
            alertId: request.alertId,
            capturedAtMs: Date.now(),
            blob,
            idempotencyKey: newSnapshotKey(),
          });
          if (!stopped) {
            setState((prev) => ({ ...prev, snapshotState: "sent" }));
          }
        } catch {
          if (!stopped) {
            setState((prev) =>
              prev.snapshotState === "failed"
                ? prev
                : { ...prev, snapshotState: "failed" }
            );
          }
        }
      })();
    };
    const resolveSnapshotPolicy = (next: "on" | "off" | "attempt"): void => {
      snapshotPolicy = next;
      if (stopped || next === "off") {
        pendingSnapshotRequests.length = 0;
        return;
      }
      for (const request of pendingSnapshotRequests.splice(0)) {
        uploadSnapshot(request);
      }
    };
    fetchAttemptMediaStatus(attemptId)
      .then((status) => {
        resolveSnapshotPolicy(status.snapshotsEnabled ? "on" : "off");
      })
      .catch(() => {
        resolveSnapshotPolicy("attempt");
      });
    const sentRecords: SentAiEventRecord[] = [];

    const setGaze = (next: AttemptGazeStatus): void => {
      if (stopped) return;
      setState((prev) => (prev.gaze === next ? prev : { ...prev, gaze: next }));
    };

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

    /** P4-D: route every snapshotRequest the ingest response carries
     * through the policy: unknown → buffer, on/attempt → upload, off →
     * drop. Never touches the detection loop. */
    const handleSnapshotRequests = (results: AiDetectionIngestResult[]): void => {
      if (stopped) return;
      const requests = results
        .map((r) => r.snapshotRequest)
        .filter((r): r is AiDetectionSnapshotRequest => r != null);
      if (requests.length === 0) return;
      if (snapshotPolicy === "off") return;
      if (snapshotPolicy === "unknown") {
        pendingSnapshotRequests.push(...requests);
        return;
      }
      for (const request of requests) {
        uploadSnapshot(request);
      }
    };

    /** Send the queue (≤8). Retry ×1 with the SAME eventIds (duplicate-safe);
     * final failure → 'degraded' ONLY — never throws to the caller. On
     * success the results are scanned for P4-D snapshotRequests. */
    const flush = async (): Promise<void> => {
      if (stopped || sending || queue.length === 0) return;
      if (queue.length < MAX_BATCH && Date.now() - lastFlushAt < MIN_FLUSH_GAP_MS) {
        return; // paced — the next interval tick retries
      }
      lastFlushAt = Date.now();
      sending = true;
      const batch = queue;
      queue = [];
      try {
        const results = await ingestAiDetections(attemptId, batch)
          .catch(() => ingestAiDetections(attemptId, batch))
          .then((res) => res.results);
        recordSent(batch);
        if (statusRef.current === "degraded") enter("running");
        handleSnapshotRequests(results);
      } catch {
        // Batch is dropped (bounded memory); detection keeps running.
        enter("degraded");
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
      const gaze = frame.gaze ?? null;
      publishAiFrameSample({
        processingMs: frame.processingMs,
        frameWidth: frame.frameWidth,
        frameHeight: frame.frameHeight,
        runtime: frame.runtime,
        simulated: frame.simulated ?? false,
        at: frame.capturedAt,
        detectionCount: frame.detections.length,
        gazeMs: gaze ? gaze.processingMs : null,
      });
      const observedAt = new Date(frame.capturedAt).toISOString();
      const now = Date.now();
      /** Queue one event unless its type was sent within the pacing window. */
      const enqueue = (
        eventType: AiDetectionEventType,
        boxes: DetectionBox[],
        model: { id: string; version: string },
        runtime: AiRuntime,
        processingMs: number
      ): void => {
        const last = lastQueuedAt[eventType] ?? 0;
        if (now - last < EVENT_SUPPRESS_MS) return; // suppressed, not lost truth
        lastQueuedAt[eventType] = now;
        sequence += 1;
        queue.push({
          eventId: newEventId(sequence),
          eventType,
          observedAt,
          sequence,
          modelId: model.id,
          modelVersion: model.version,
          runtime,
          frameWidth: frame.frameWidth,
          frameHeight: frame.frameHeight,
          processingMs,
          detections: toPayloadBoxes(boxes),
        });
      };

      const decision = decideDetectionEvents(frame.detections, counters);
      counters = decision.counters;
      for (const event of decision.events) {
        enqueue(event.eventType, event.detections, MODEL, frame.runtime, frame.processingMs);
      }

      // Gaze: the tracker owns calibration / smoothing / sustain rules; a
      // report is only ever an observation for the teacher feed.
      if (gaze) {
        const update = gazeTracker.update(frame.capturedAt / 1000, gaze);
        setGaze(update.calibrated ? "running" : "calibrating");
        const box = update.report ? gazeEventBox(update.report, gaze) : null;
        if (box) {
          enqueue("LOOKING_AWAY_OBSERVED", [box], GAZE_MODEL, gaze.runtime, gaze.processingMs);
        }
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
      const g = gazeEstimator;
      gazeEstimator = null;
      if (g) void g.release().catch(() => undefined);
    };

    /** Attach the gaze reading of the same frame; a gaze failure never
     * costs the object-detection frame. */
    const withGaze = async (
      frame: DetectionFrame | null,
      video: HTMLVideoElement
    ): Promise<DetectionFrame | null> => {
      const estimator = gazeEstimator;
      if (!frame || !estimator) return frame;
      try {
        frame.gaze = await estimator.estimate(video);
        gazeFailures = 0;
      } catch {
        gazeFailures += 1;
        if (gazeFailures >= GAZE_MAX_FAILURES && gazeEstimator === estimator) {
          gazeEstimator = null;
          void estimator.release().catch(() => undefined);
          setGaze("unavailable");
        }
      }
      return frame;
    };

    /** Load the gaze models in the background — object detection is
     * already running and stays independent of the outcome. */
    const startGaze = (): void => {
      setGaze("loading");
      void createGazeEstimator().then(
        (estimator) => {
          if (stopped) {
            void estimator.release().catch(() => undefined);
            return;
          }
          if (estimator.status !== "running") {
            setGaze("unavailable");
            return;
          }
          gazeEstimator = estimator;
        },
        () => setGaze("unavailable")
      );
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
      const hasFakeNow = (): boolean => getFakeDetector() != null;
      if (hasFakeNow()) {
        simulated = true;
        setState((prev) => ({ ...prev, simulated: true }));
        detector = {
          status: "running",
          runtime: null,
          // Consult the registry on EVERY call: a fake injected after this
          // detector was built (e2e mid-test injection) must take over on
          // the next analyzed frame — and dropping back to the real adapter
          // must work too (setFakeDetector(null)).
          detect: (video) => {
            const f = getFakeDetector();
            return f ? Promise.resolve(f(video)) : Promise.resolve(null);
          },
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
      const detectFrame = (): Promise<DetectionFrame | null> => {
        // A fake injected after the real detector loaded takes over
        // immediately; clearing it resumes the REAL model (status stays
        // honest — frames are labeled by their producer).
        const f = getFakeDetector();
        if (f) {
          if (!simulated) {
            simulated = true;
            setState((prev) => ({ ...prev, simulated: true }));
          }
          return Promise.resolve(f(video));
        }
        if (simulated) {
          simulated = false;
          setState((prev) => ({ ...prev, simulated: false }));
        }
        return activeDetector.detect(video).then((frame) => withGaze(frame, video));
      };
      scheduler = createDetectionScheduler({
        detect: detectFrame,
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
      // The fake detector (tests/e2e) supplies its own `gaze` readings.
      if (GAZE_ENABLED && !hasFakeNow()) startGaze();
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
