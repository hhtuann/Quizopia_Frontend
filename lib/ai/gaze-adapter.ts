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

/**
 * Pipeline isolation (yolo26s keeps running whatever gaze does): every gaze
 * call on the SHARED onnxruntime queue is leased. If one overruns, the gaze
 * estimator retires itself ('unavailable') and the queue moves on to the
 * next yolo26s frame instead of waiting behind a wedged gaze run.
 */
export const GAZE_RUN_LEASE_MS = 3_000;
/** Session creation + warm-up (compiles kernels) may legitimately be slow. */
export const GAZE_CREATE_LEASE_MS = 30_000;
/** Whole model load (fetch + both sessions) before giving up on gaze. */
export const GAZE_LOAD_DEADLINE_MS = 60_000;

async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model fetch ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Reject when `promise` has not settled after `ms` (the work itself is
 * not cancelled — callers must stop using its result). */
function withDeadline<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

interface SessionPair {
  face: OrtSessionLike;
  gaze: OrtSessionLike;
}

/**
 * Create both sessions on one execution-provider list and run each once on
 * zeros: backend problems (unsupported op, GPU out of memory) surface here
 * instead of on the first real frame. Every call is leased (see above).
 */
async function createSessions(
  ort: OrtModuleLike,
  faceBytes: Uint8Array,
  gazeBytes: Uint8Array,
  executionProviders: string[],
  onOverrun: () => void
): Promise<SessionPair> {
  const lease = { ms: GAZE_CREATE_LEASE_MS, onOverrun };
  let face: OrtSessionLike | null = null;
  let gaze: OrtSessionLike | null = null;
  try {
    // Copies: ort may transfer/detach the buffer it is handed, and a
    // failed WebGPU attempt must leave the bytes intact for the wasm retry.
    face = await runOrtExclusive(
      () => ort.InferenceSession.create(faceBytes.slice(), { executionProviders }),
      lease
    );
    gaze = await runOrtExclusive(
      () => ort.InferenceSession.create(gazeBytes.slice(), { executionProviders }),
      lease
    );
    const faceSession = face;
    const gazeSession = gaze;
    await runOrtExclusive(
      () =>
        faceSession.run({
          images: new ort.Tensor(
            "float32",
            new Float32Array(3 * FACE_INPUT_SIZE * FACE_INPUT_SIZE),
            [1, 3, FACE_INPUT_SIZE, FACE_INPUT_SIZE]
          ),
        }),
      lease
    );
    await runOrtExclusive(
      () =>
        gazeSession.run({
          input: new ort.Tensor(
            "float32",
            new Float32Array(3 * GAZE_INPUT_SIZE * GAZE_INPUT_SIZE),
            [1, 3, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE]
          ),
        }),
      lease
    );
    return { face, gaze };
  } catch (err) {
    const f = face;
    const g = gaze;
    if (f) await runOrtExclusive(() => f.release()).catch(() => undefined);
    if (g) await runOrtExclusive(() => g.release()).catch(() => undefined);
    throw err;
  }
}

/**
 * Create the real gaze estimator. Any load failure (fetch, wasm, WebGPU
 * with no wasm fallback, a load that never finishes) resolves to status
 * 'unavailable' — honest, and independent of the yolo26s detector (object
 * detection keeps running).
 */
export async function createGazeEstimator(): Promise<GazeEstimator> {
  let status: GazeEstimatorStatus = "loading";
  let runtime: AiRuntime | null = null;
  let ort: OrtModuleLike | null = null;
  let sessions: SessionPair | null = null;
  let frameCanvas: HTMLCanvasElement | null = null;
  let faceCanvas: HTMLCanvasElement | null = null;
  let gazeCanvas: HTMLCanvasElement | null = null;
  /** Set when a leased gaze call overran: the runtime may still be inside
   * that call, so its sessions are never touched again (no run, no release). */
  let retired = false;
  const retire = (): void => {
    retired = true;
    if (status !== "released") status = "unavailable";
  };
  const lease = { ms: GAZE_RUN_LEASE_MS, onOverrun: retire };

  try {
    const load = async (): Promise<void> => {
      ort = await loadOrt();
      const ortLoaded = ort;
      const [faceBytes, gazeBytes] = await Promise.all([
        fetchModel(FACE_MODEL_URL),
        fetchModel(GAZE_MODEL_URL),
      ]);
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        try {
          sessions = await createSessions(ortLoaded, faceBytes, gazeBytes, ["webgpu", "wasm"], retire);
          runtime = "ORT_WEB_WEBGPU";
        } catch {
          sessions = null;
        }
      }
      if (!sessions && !retired) {
        sessions = await createSessions(ortLoaded, faceBytes, gazeBytes, ["wasm"], retire);
        runtime = "ORT_WEB_WASM";
      }
    };
    await withDeadline(load(), GAZE_LOAD_DEADLINE_MS, "gaze model load");
    if (retired || !sessions) throw new Error("gaze sessions unavailable");

    frameCanvas = document.createElement("canvas");
    faceCanvas = document.createElement("canvas");
    faceCanvas.width = FACE_INPUT_SIZE;
    faceCanvas.height = FACE_INPUT_SIZE;
    gazeCanvas = document.createElement("canvas");
    gazeCanvas.width = GAZE_INPUT_SIZE;
    gazeCanvas.height = GAZE_INPUT_SIZE;
    status = "running";
  } catch {
    // A load that timed out may still finish later: never adopt it.
    retired = true;
    status = "unavailable";
    sessions = null;
    frameCanvas = null;
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
        retired ||
        !ort ||
        !sessions ||
        !frameCanvas ||
        !faceCanvas ||
        !gazeCanvas ||
        runtime == null
      ) {
        return null;
      }
      const ortNow: OrtModuleLike = ort;
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      if (srcW <= 0 || srcH <= 0) return null; // no decoded frame yet

      const t0 = now();
      const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
      const faceCtx = faceCanvas.getContext("2d", { willReadFrequently: true });
      const gazeCtx = gazeCanvas.getContext("2d", { willReadFrequently: true });
      if (!frameCtx || !faceCtx || !gazeCtx) return null;

      // 0. Freeze ONE video frame: the face box and the gaze crop must come
      //    from the same pixels (the video advances during the face run).
      if (frameCanvas.width !== srcW) frameCanvas.width = srcW;
      if (frameCanvas.height !== srcH) frameCanvas.height = srcH;
      frameCtx.drawImage(video, 0, 0, srcW, srcH);

      // 1. Face detection on the letterboxed frame (same convention as
      //    yolo26s: RGB /255, pad rgb(114,114,114)).
      const geom = letterboxGeometry(srcW, srcH, FACE_INPUT_SIZE);
      faceCtx.fillStyle = "rgb(114,114,114)";
      faceCtx.fillRect(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE);
      faceCtx.drawImage(frameCanvas, geom.dx, geom.dy, geom.destW, geom.destH);
      const faceInput = new ortNow.Tensor(
        "float32",
        rgbaToNormalizedChw(
          faceCtx.getImageData(0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE).data,
          FACE_INPUT_SIZE
        ),
        [1, 3, FACE_INPUT_SIZE, FACE_INPUT_SIZE]
      );
      const { face: faceSession, gaze: gazeSession } = sessions;
      const faceOut = (
        await runOrtExclusive(() => faceSession.run({ images: faceInput }), lease)
      ).output0;
      if (!faceOut || retired) return null;
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

      // 2. Gaze on the largest face crop of the SAME frozen frame
      //    (stretched to 448², ImageNet norm).
      const x = Math.floor(main.x1);
      const y = Math.floor(main.y1);
      const w = Math.max(1, Math.floor(main.x2) - x);
      const h = Math.max(1, Math.floor(main.y2) - y);
      gazeCtx.drawImage(frameCanvas, x, y, w, h, 0, 0, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE);
      const gazeInput = new ortNow.Tensor(
        "float32",
        rgbaToNormalizedChw(
          gazeCtx.getImageData(0, 0, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE).data,
          GAZE_INPUT_SIZE,
          IMAGENET_MEAN,
          IMAGENET_STD
        ),
        [1, 3, GAZE_INPUT_SIZE, GAZE_INPUT_SIZE]
      );
      const gazeOut = await runOrtExclusive(() => gazeSession.run({ input: gazeInput }), lease);
      if (retired) return null;
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
      frameCanvas = null;
      faceCanvas = null;
      gazeCanvas = null;
      // A retired estimator's runtime may still be inside an overrun call:
      // leave its sessions alone rather than overlap a release with it.
      if (s && !retired) {
        await runOrtExclusive(() => s.face.release()).catch(() => undefined);
        await runOrtExclusive(() => s.gaze.release()).catch(() => undefined);
      }
    },
  };
}
