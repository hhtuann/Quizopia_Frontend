/**
 * Browser side of e2e/gaze-benchmark.mts — runs the PRODUCTION adapters
 * (lib/ai/model-adapter.ts, lib/ai/gaze-adapter.ts, lib/ai/gaze-core.ts and
 * the hook's event rule `decideDetectionEvents`) in a real Chromium, in the
 * same ORDER as the attempt page (yolo26s, then face + gaze on the same
 * video frame, all through the shared onnxruntime-web queue). It is NOT the
 * page's scheduler: no adaptive FPS budget and no gaze timeout — the loop
 * runs flat out to measure capacity. Event counts apply the page's 10 s
 * per-type pacing so they match what the page would send.
 *
 * Nothing here is a fake model: every number is a real inference. The INPUT
 * stream is labeled per pass (still photo drawn on a canvas, synthetic
 * no-face canvas, or the physical webcam).
 */
import { createDetector, type DetectionFrame } from "@/lib/ai/model-adapter";
import { createGazeEstimator } from "@/lib/ai/gaze-adapter";
import { GazeTracker, type GazeObservation } from "@/lib/ai/gaze-core";
import {
  decideDetectionEvents,
  type DetectionCounters,
} from "@/lib/ai/use-attempt-ai-detection";

export interface PassSpec {
  label: string;
  /** "image:<url>" | "synthetic" | "webcam" */
  source: string;
  seconds: number;
  /** Webcam protocol: timed instructions shown on screen. */
  phases?: Array<{ from: number; text: string; expect: "screen" | "away" }>;
  /** "combined" (production chain) | "object-only" | "gaze-only" */
  mode: "combined" | "object-only" | "gaze-only";
}

interface Sample {
  t: number;
  objMs: number | null;
  gazeMs: number | null;
  wallMs: number;
  faces: number | null;
  yaw: number | null;
  pitch: number | null;
  faceWidthPx: number | null;
  classes: number[];
  phase: string | null;
  expect: "screen" | "away" | null;
}

function jitterCanvas(img: HTMLImageElement): MediaStream {
  // Simulate a live camera from a still photo: tiny sub-pixel drift and
  // brightness flicker so every frame is a new decode, like a real sensor.
  const w = 1280;
  const h = 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  let t = 0;
  const draw = (): void => {
    ctx.fillStyle = "#777";
    ctx.fillRect(0, 0, w, h);
    ctx.filter = `brightness(${1 + Math.sin(t * 1.3) * 0.04})`;
    ctx.drawImage(img, (w - dw) / 2 + Math.sin(t) * 3, (h - dh) / 2 + Math.cos(t * 0.7) * 2, dw, dh);
    ctx.filter = "none";
    t += 0.05;
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(30);
}

function syntheticCanvas(): MediaStream {
  const w = 1280;
  const h = 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  let t = 0;
  const draw = (): void => {
    ctx.fillStyle = "#202020";
    ctx.fillRect(0, 0, w, h);
    const x = (Math.sin(t) * 0.5 + 0.5) * (w - 200);
    ctx.fillStyle = "#c0c0c8";
    ctx.fillRect(x, h / 2 - 120, 200, 240);
    t += 0.05;
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(30);
}

async function openSource(source: string): Promise<MediaStream> {
  if (source === "webcam") {
    return navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
  }
  if (source === "synthetic") return syntheticCanvas();
  const url = source.replace(/^image:/, "");
  const img = new Image();
  img.src = url;
  await img.decode();
  return jitterCanvas(img);
}

async function runPass(spec: PassSpec): Promise<Record<string, unknown>> {
  const banner = document.getElementById("banner")!;
  const stream = await openSource(spec.source);
  const video = document.getElementById("video") as HTMLVideoElement;
  video.srcObject = stream;
  await video.play();
  await new Promise<void>((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0) resolve();
    else video.addEventListener("loadeddata", () => resolve(), { once: true });
  });
  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
  const trackLabel = stream.getVideoTracks()[0]?.label ?? "";

  const tLoad0 = performance.now();
  const detector = spec.mode === "gaze-only" ? null : await createDetector();
  const tObjLoaded = performance.now();
  const estimator = spec.mode === "object-only" ? null : await createGazeEstimator();
  const tGazeLoaded = performance.now();
  if (detector && detector.status !== "running") throw new Error("yolo26s did not load");
  if (estimator && estimator.status !== "running") throw new Error("gaze models did not load");

  // Warm-up (first run compiles kernels) — excluded from the stats.
  if (detector) await detector.detect(video);
  if (estimator) await estimator.estimate(video);

  const tracker = new GazeTracker();
  const reports: Array<Record<string, unknown>> = [];
  /** Per-frame rule hits (raw) and what the page would actually send
   * after its 10 s per-type pacing (EVENT_SUPPRESS_MS in the hook). */
  const objectFrameHits: Record<string, number> = {};
  const objectEventsSent: Record<string, number> = {};
  const lastSentAt: Record<string, number> = {};
  const EVENT_SUPPRESS_MS = 10_000;
  let gazeEventsSent = 0;
  let lastGazeSentAt = -Infinity;
  let counters: DetectionCounters = { personAbsentStreak: 0 };
  const samples: Sample[] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < spec.seconds * 1000) {
    const t = (performance.now() - t0) / 1000;
    const phase = spec.phases ? [...spec.phases].reverse().find((p) => t >= p.from) ?? null : null;
    if (phase) banner.textContent = phase.text;
    const s = performance.now();
    let frame: DetectionFrame | null = null;
    if (detector) frame = await detector.detect(video);
    let gaze: GazeObservation | null = null;
    if (estimator) gaze = await estimator.estimate(video);
    const wall = performance.now() - s;
    if (frame) {
      const d = decideDetectionEvents(frame.detections, counters);
      counters = d.counters;
      for (const e of d.events) {
        objectFrameHits[e.eventType] = (objectFrameHits[e.eventType] ?? 0) + 1;
        const nowMs = t * 1000;
        if (nowMs - (lastSentAt[e.eventType] ?? -Infinity) >= EVENT_SUPPRESS_MS) {
          lastSentAt[e.eventType] = nowMs;
          objectEventsSent[e.eventType] = (objectEventsSent[e.eventType] ?? 0) + 1;
        }
      }
    }
    if (gaze) {
      const u = tracker.update(t, gaze);
      if (u.report) {
        if (t * 1000 - lastGazeSentAt >= EVENT_SUPPRESS_MS) {
          lastGazeSentAt = t * 1000;
          gazeEventsSent += 1;
        }
        reports.push({
          t: Math.round(t * 10) / 10,
          kind: u.report.kind,
          direction: u.direction,
          deltaYaw: u.deltaYaw,
          deltaPitch: u.deltaPitch,
          phase: phase?.text ?? null,
          expect: phase?.expect ?? null,
        });
      }
    }
    samples.push({
      t,
      objMs: frame ? frame.processingMs : null,
      gazeMs: gaze ? gaze.processingMs : null,
      wallMs: wall,
      faces: gaze ? gaze.faceCount : null,
      yaw: gaze?.yaw ?? null,
      pitch: gaze?.pitch ?? null,
      faceWidthPx: gaze ? Math.round(gaze.faceWidthPx) : null,
      classes: frame ? frame.detections.map((d) => d.classId) : [],
      phase: phase?.text ?? null,
      expect: phase?.expect ?? null,
    });
    // Same cadence budget as production is adaptive; here we run flat out
    // to measure capacity, yielding one macrotask between frames.
    await new Promise((r) => setTimeout(r, 0));
  }
  const elapsedS = (performance.now() - t0) / 1000;
  await detector?.release();
  await estimator?.release();
  stream.getTracks().forEach((tr) => tr.stop());
  video.srcObject = null;
  banner.textContent = "";
  return {
    label: spec.label,
    source: spec.source,
    mode: spec.mode,
    trackLabel,
    trackSettings: { width: settings.width, height: settings.height, frameRate: settings.frameRate },
    objectRuntime: detector?.runtime ?? null,
    gazeRuntime: estimator?.runtime ?? null,
    loadMs: {
      yolo26s: detector ? Math.round(tObjLoaded - tLoad0) : null,
      faceAndGaze: estimator ? Math.round(tGazeLoaded - tObjLoaded) : null,
    },
    elapsedS,
    calibrated: tracker.calibrated,
    baseline: tracker.baselineAngles,
    reports,
    gazeEventsSent,
    objectFrameHits,
    objectEventsSent,
    samples,
  };
}

declare global {
  interface Window {
    __gazeBench: { runPass: typeof runPass };
  }
}
window.__gazeBench = { runPass };
