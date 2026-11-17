"use client";

/**
 * Gaze estimator adapter — YOLO11n-face → MobileGaze (MobileOne-S0), both
 * on ONNX Runtime Web, on the student's own camera frame.
 *
 * Replaces the P4-C disabled stub: yolo26s (COCO) has no gaze output, so
 * gaze uses two dedicated models (see public/models/MODELCARD.md):
 *   1. `yolov11n-face.onnx`  — `images [1,3,640,640]` → `output0 [1,5,8400]`
 *   2. `mobileone_s0_gaze.onnx` — `input [1,3,448,448]` → `yaw`/`pitch [1,90]`
 *
 * A gaze angle is a CLIENT OBSERVATION for teacher review — inconclusive
 * context, never a verdict and never score input (ADR-008 D8). No frame or
 * crop leaves the browser; only angles + a normalized face box are sent.
 */

import {
  letterboxGeometry,
  loadOrt,
  runOrtExclusive,
  type AiRuntime,
  type OrtModuleLike,
  type OrtSessionLike,
} from "./model-adapter";
import {
  FACE_INPUT_SIZE,
  GAZE_INPUT_SIZE,
  IMAGENET_MEAN,
  IMAGENET_STD,
  decodeFaceOutput,
  decodeGaze,
  rgbaToNormalizedChw,
  type GazeObservation,
} from "./gaze-core";

/** Model card constants — mirror public/models/MODELCARD.md. */
export const GAZE_MODEL = {
  id: "mobilegaze-mobileone-s0",
  version: "gaze360-onnx",
  inputSize: GAZE_INPUT_SIZE,
  faceModelId: "yolov11n-face",
  faceModelVersion: "8.3.20-onnx",
  faceInputSize: FACE_INPUT_SIZE,
} as const;

export const FACE_MODEL_URL = "/models/yolov11n-face.onnx";
export const GAZE_MODEL_URL = "/models/mobileone_s0_gaze.onnx";

/**
 * Build-time kill switch: `NEXT_PUBLIC_AI_GAZE=off` ships the attempt page
 * without gaze analysis (object detection is unaffected).
 */
export const GAZE_ENABLED = process.env.NEXT_PUBLIC_AI_GAZE !== "off";

/** Capability surface (was the P4-C `supported: false` stub). */
export const GAZE_SUPPORT = {
  supported: true,
  models: [GAZE_MODEL.faceModelId, GAZE_MODEL.id],
  reason: "dedicated face + gaze models (yolo26s itself has no gaze output)",
} as const;

export type GazeSupport = typeof GAZE_SUPPORT;

export type GazeEstimatorStatus = "loading" | "running" | "unavailable" | "released";

export interface GazeEstimator {
  readonly status: GazeEstimatorStatus;
  readonly runtime: AiRuntime | null;
  /**
   * Analyze the CURRENT frame of `video`. Resolves null when the estimator
   * is not running or the video has no decoded frame — never a fake value.
   */
  estimate(video: HTMLVideoElement): Promise<GazeObservation | null>;
  release(): Promise<void>;
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model fetch ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

interface SessionPair {
  face: OrtSessionLike;
  gaze: OrtSessionLike;
}

/**
 * Create both sessions on one execution-provider list and run each once on
 * zeros: backend problems (unsupported op, GPU out of memory) surface here
 * instead of on the first real frame.
 */
async function createSessions(
  ort: OrtModuleLike,
  faceBytes: Uint8Array,
  gazeBytes: Uint8Array,
  executionProviders: string[]
): Promise<SessionPair> {
  let face: OrtSessionLike | null = null;
  let gaze: OrtSessionLike | null = null;
  try {
    // Copies: ort may transfer/detach the buffer it is handed, and a
    // failed WebGPU attempt must leave the bytes intact for the wasm retry.
    face = await runOrtExclusive(() =>
      ort.InferenceSession.create(faceBytes.slice(), { executionProviders })
    );
    gaze = await runOrtExclusive(() =>
      ort.InferenceSession.create(gazeBytes.slice(), { executionProviders })
    );
    const faceSession = face;
    const gazeSession = gaze;
    await runOrtExclusive(() =>
      faceSession.run({
        images: new ort.Tensor(
          "float32",
          new Float32Array(3 * FACE_INPUT_SIZE * FACE_INPUT_SIZE),
          [1, 3, FACE_INPUT_SIZE, FACE_INPUT_SIZE]
        ),
      })
    );
    await runOrtExclusive(() =>
      gazeSession.run({
        input: new ort.Tensor(
          "float32",
          new Float32Array(3 * GAZE_INPUT_SIZE * GAZE_INPUT_SIZE),
          [1, 3, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE]
        ),
      })
    );
    return { face, gaze };
  } catch (err) {
    await face?.release().catch(() => undefined);
    await gaze?.release().catch(() => undefined);
    throw err;
  }
}

/**
 * Create the real gaze estimator. Any load failure (fetch, wasm, WebGPU
 * with no wasm fallback) resolves to status 'unavailable' — honest, and
 * independent of the yolo26s detector (object detection keeps running).
 */
export async function createGazeEstimator(): Promise<GazeEstimator> {
  let status: GazeEstimatorStatus = "loading";
  let runtime: AiRuntime | null = null;
  let ort: OrtModuleLike | null = null;
  let sessions: SessionPair | null = null;
  let faceCanvas: HTMLCanvasElement | null = null;
  let gazeCanvas: HTMLCanvasElement | null = null;

  try {
    ort = await loadOrt();
    const [faceBytes, gazeBytes] = await Promise.all([
      fetchModel(FACE_MODEL_URL),
      fetchModel(GAZE_MODEL_URL),
    ]);

    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        sessions = await createSessions(ort, faceBytes, gazeBytes, ["webgpu", "wasm"]);
        runtime = "ORT_WEB_WEBGPU";
      } catch {
        sessions = null;
      }
    }
    if (!sessions) {
      sessions = await createSessions(ort, faceBytes, gazeBytes, ["wasm"]);
      runtime = "ORT_WEB_WASM";
    }

    faceCanvas = document.createElement("canvas");
    faceCanvas.width = FACE_INPUT_SIZE;
    faceCanvas.height = FACE_INPUT_SIZE;
    gazeCanvas = document.createElement("canvas");
    gazeCanvas.width = GAZE_INPUT_SIZE;
    gazeCanvas.height = GAZE_INPUT_SIZE;
    status = "running";
  } catch {
    status = "unavailable";
    sessions = null;
    faceCanvas = null;
    gazeCanvas = null;
    runtime = null;
  }

  return {
    get status() {
      return status;
    },
    get runtime() {
      return runtime;
    },
    async estimate(video: HTMLVideoElement): Promise<GazeObservation | null> {
      if (
        status !== "running" ||
        !ort ||
        !sessions ||
        !faceCanvas ||
        !gazeCanvas ||
        runtime == null
      ) {
        return null;
      }
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      if (srcW <= 0 || srcH <= 0) return null; // no decoded frame yet

      const t0 = now();
      const faceCtx = faceCanvas.getContext("2d", { willReadFrequently: true });
      const gazeCtx = gazeCanvas.getContext("2d", { willReadFrequently: true });
      if (!faceCtx || !gazeCtx) return null;

      // 1. Face detection on the letterboxed frame (same convention as
      //    yolo26s: RGB /255, pad rgb(114,114,114)).
      const geom = letterboxGeometry(srcW, srcH, FACE_INPUT_SIZE);
      faceCtx.fillStyle = "rgb(114,114,114)";
      faceCtx.fillRect(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE);
      faceCtx.drawImage(video, geom.dx, geom.dy, geom.destW, geom.destH);
      const faceInput = new ort.Tensor(
        "float32",
        rgbaToNormalizedChw(
          faceCtx.getImageData(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE).data,
          FACE_INPUT_SIZE
        ),
        [1, 3, FACE_INPUT_SIZE, FACE_INPUT_SIZE]
      );
      const { face: faceSession, gaze: gazeSession } = sessions;
      const faceOut = (await runOrtExclusive(() => faceSession.run({ images: faceInput })))
        .output0;
      if (!faceOut) return null;
      const numAnchors = faceOut.dims[faceOut.dims.length - 1] ?? 0;
      const faces = decodeFaceOutput(faceOut.data, numAnchors, geom, srcW, srcH);

      const runtimeNow = runtime;
      const main = faces[0];
      if (!main) {
        return {
          faceCount: 0,
          faceBox: null,
          faceScore: null,
          faceWidthPx: 0,
          yaw: null,
          pitch: null,
          processingMs: Math.max(0, Math.round(now() - t0)),
          runtime: runtimeNow,
        };
      }

      // 2. Gaze on the largest face crop (stretched to 448², ImageNet norm).
      const x = Math.floor(main.x1);
      const y = Math.floor(main.y1);
      const w = Math.max(1, Math.floor(main.x2) - x);
      const h = Math.max(1, Math.floor(main.y2) - y);
      gazeCtx.drawImage(video, x, y, w, h, 0, 0, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE);
      const gazeInput = new ort.Tensor(
        "float32",
        rgbaToNormalizedChw(
          gazeCtx.getImageData(0, 0, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE).data,
          GAZE_INPUT_SIZE,
          IMAGENET_MEAN,
          IMAGENET_STD
        ),
        [1, 3, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE]
      );
      const gazeOut = await runOrtExclusive(() => gazeSession.run({ input: gazeInput }));
      const angles =
        gazeOut.yaw && gazeOut.pitch
          ? decodeGaze(gazeOut.yaw.data, gazeOut.pitch.data)
          : null;

      const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
      return {
        faceCount: faces.length,
        faceBox: [
          clamp01(main.x1 / srcW),
          clamp01(main.y1 / srcH),
          clamp01(main.x2 / srcW),
          clamp01(main.y2 / srcH),
        ],
        faceScore: Math.min(1, Math.max(0, main.score)),
        faceWidthPx: main.x2 - main.x1,
        yaw: angles && Number.isFinite(angles.yaw) ? angles.yaw : null,
        pitch: angles && Number.isFinite(angles.pitch) ? angles.pitch : null,
        processingMs: Math.max(0, Math.round(now() - t0)),
        runtime: runtimeNow,
      };
    },
    async release(): Promise<void> {
      if (status === "released") return;
      status = "released";
      const s = sessions;
      sessions = null;
      faceCanvas = null;
      gazeCanvas = null;
      if (s) {
        await s.face.release().catch(() => undefined);
        await s.gaze.release().catch(() => undefined);
      }
    },
  };
}
