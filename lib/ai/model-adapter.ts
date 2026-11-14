"use client";

/**
 * P4-C AI proctoring — YOLO26s model adapter (CONTRACT §6, ADR-008 D8).
 *
 * Browser-side inference with ONNX Runtime Web on the student's own camera
 * track. Detections are CLIENT observations — never labeled SERVER_VERIFIED,
 * never auto-concluding misconduct.
 *
 * `onnxruntime-web` is imported DYNAMICALLY inside {@link createDetector}:
 * the package's wasm loader + binary (~28MB) must stay out of the main
 * bundle so the attempt page never pays for it until AI detection actually
 * starts (and vitest never loads it at all — tests mock the module or use
 * the pure helpers below).
 */

/** Model card constant — mirrors p4c/CONTRACT.md §1 + public/models/MODELCARD.md. */
export const MODEL = {
  id: "yolo26s",
  version: "8.4.64-onnx",
  inputSize: 640,
  /** COCO class ids this proctoring slice maps (subset of the 80). */
  classes: { 0: "person", 62: "tv", 63: "laptop", 67: "cell phone" } as Record<
    number,
    string
  >,
  license: "AGPL-3.0",
} as const;

export const MODEL_URL = "/models/yolo26s.onnx";
/**
 * ort-web wasm artifacts served as static assets. The root
 * `onnxruntime-web` entry resolves to `dist/ort.bundle.min.mjs`, whose
 * loader is hardcoded to `ort-wasm-simd-threaded.jsep.{mjs,wasm}` (the JSEP
 * build serves BOTH the wasm CPU EP and WebGPU) — exactly the two files
 * copied to `public/ort/` (see frontend/AGENTS notes in the P4-C report).
 */
export const ORT_WASM_PATHS = "/ort/";

/** Minimum score for a detection to count for phone/screen/person EVENTS. */
export const MIN_SCORE_EVENT = 0.5;
/** Lower bar for the person-ABSENCE check (a faint person still counts). */
export const MIN_SCORE_PERSON_PRESENT = 0.4;

/** Relevant COCO class ids we parse out of output0 (others are ignored). */
const RELEVANT_CLASSES = new Set([0, 62, 63, 67]);

export type AiRuntime = "ORT_WEB_WASM" | "ORT_WEB_WEBGPU";

/** One detection box, normalized 0..1 to the SOURCE frame (post un-letterbox). */
export interface DetectionBox {
  classId: number;
  label: string;
  confidence: number;
  /** [x1, y1, x2, y2] normalized 0..1, clamped. */
  bbox: [number, number, number, number];
}

export interface DetectionFrame {
  detections: DetectionBox[];
  /** Source frame geometry (decoded-frame truth: videoWidth/videoHeight). */
  frameWidth: number;
  frameHeight: number;
  /** preprocess + inference + postprocess, honest telemetry (ms). */
  processingMs: number;
  /** Frame capture time on the client clock (epoch ms). */
  capturedAt: number;
  runtime: AiRuntime;
  /** True when produced by the e2e FAKE detector (labeled SIMULATED). */
  simulated?: boolean;
}

export type DetectorStatus = "loading" | "running" | "unavailable" | "released";

export interface Detector {
  readonly status: DetectorStatus;
  readonly runtime: AiRuntime | null;
  /**
   * Analyze the CURRENT frame of `video`. Resolves null when the detector is
   * not running or the video has no decoded frame yet (videoWidth 0) — never
   * fakes a result.
   */
  detect(video: HTMLVideoElement): Promise<DetectionFrame | null>;
  release(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Pure letterbox / postprocess math (unit-tested directly).           */
/* ------------------------------------------------------------------ */

export interface LetterboxGeometry {
  /** min(640/w, 640/h) — no upscale beyond scale>1? Ultralytics allows up; */
  /** we keep the same convention: uniform scale, letterbox (never stretch). */
  scale: number;
  /** Top-left of the drawn image inside the 640×640 canvas. */
  dx: number;
  dy: number;
  /** Drawn (scaled) image size on the canvas. */
  destW: number;
  destH: number;
}

/** Letterbox geometry for a source frame into MODEL.inputSize² (pad 114). */
export function letterboxGeometry(
  srcW: number,
  srcH: number,
  inputSize = MODEL.inputSize
): LetterboxGeometry {
  const scale = Math.min(inputSize / srcW, inputSize / srcH);
  const destW = Math.round(srcW * scale);
  const destH = Math.round(srcH * scale);
  return {
    scale,
    dx: Math.floor((inputSize - destW) / 2),
    dy: Math.floor((inputSize - destH) / 2),
    destW,
    destH,
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Map a bbox from 640-letterbox pixel coords back to NORMALIZED source
 * coords: un-translate the letterbox offset, un-scale, clamp 0..1.
 */
export function unletterboxBox(
  box: readonly [number, number, number, number],
  geom: LetterboxGeometry,
  srcW: number,
  srcH: number
): [number, number, number, number] {
  const x1 = clamp01((box[0] - geom.dx) / geom.scale / srcW);
  const y1 = clamp01((box[1] - geom.dy) / geom.scale / srcH);
  const x2 = clamp01((box[2] - geom.dx) / geom.scale / srcW);
  const y2 = clamp01((box[3] - geom.dy) / geom.scale / srcH);
  return [x1, y1, x2, y2];
}

/**
 * Parse YOLO26 `output0` `[1,rows,6]` (rows = [x1,y1,x2,y2,score,classId],
 * end-to-end NMS already applied) into normalized {@link DetectionBox}es.
 *
 * Score thresholds per contract §6: person boxes pass at ≥0.4 (they also
 * feed the person-absence check); phone/tv/laptop at ≥0.5. Event decisions
 * re-apply the 0.5 bar for person EVENTS (multi-person) — see
 * use-attempt-ai-detection.ts.
 */
export function parseModelOutput(
  output: Float32Array,
  rows: number,
  geom: LetterboxGeometry,
  srcW: number,
  srcH: number
): DetectionBox[] {
  const detections: DetectionBox[] = [];
  for (let r = 0; r < rows; r++) {
    const base = r * 6;
    const classId = output[base + 5];
    if (!RELEVANT_CLASSES.has(classId)) continue;
    const minScore =
      classId === 0 ? MIN_SCORE_PERSON_PRESENT : MIN_SCORE_EVENT;
    const score = output[base + 4];
    if (score < minScore) continue;
    const box: readonly [number, number, number, number] = [
      output[base],
      output[base + 1],
      output[base + 2],
      output[base + 3],
    ];
    detections.push({
      classId,
      label: MODEL.classes[classId],
      confidence: score,
      bbox: unletterboxBox(box, geom, srcW, srcH),
    });
  }
  return detections;
}

/* ------------------------------------------------------------------ */
/* Detector factory.                                                   */
/* ------------------------------------------------------------------ */

/** Minimal surface of `ort` used here (keeps the dynamic import typed). */
interface OrtTensorLike {
  data: Float32Array;
  dims: readonly number[];
}
interface OrtSessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>;
  release(): Promise<void>;
}
interface OrtModuleLike {
  Tensor: new (
    type: "float32",
    data: Float32Array,
    dims: readonly number[]
  ) => unknown;
  InferenceSession: {
    create(
      model: Uint8Array,
      options?: { executionProviders?: string[] }
    ): Promise<OrtSessionLike>;
  };
  env: { wasm: { wasmPaths: string } };
}

let ortModulePromise: Promise<OrtModuleLike> | null = null;

/** Load onnxruntime-web exactly once (wasm paths pinned before any session). */
async function loadOrt(): Promise<OrtModuleLike> {
  if (!ortModulePromise) {
    ortModulePromise = import("onnxruntime-web").then((mod) => {
      const ort = mod as unknown as OrtModuleLike;
      ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
      return ort;
    });
  }
  return ortModulePromise;
}

/** RGB /255 CHW plane extraction from raw RGBA ImageData. */
export function rgbaToChw(
  rgba: Uint8ClampedArray,
  size: number = MODEL.inputSize
): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = rgba[i * 4] / 255; // R
    out[plane + i] = rgba[i * 4 + 1] / 255; // G
    out[2 * plane + i] = rgba[i * 4 + 2] / 255; // B
  }
  return out;
}

/**
 * Create the real-model detector. Session creation failure (wasm blocked,
 * fetch failed, WebGPU init error with no wasm fallback) resolves to a
 * detector whose status is 'unavailable' — honest, never fake.
 */
export async function createDetector(): Promise<Detector> {
  let status: DetectorStatus = "loading";
  let runtime: AiRuntime | null = null;
  let ort: OrtModuleLike | null = null;
  let session: OrtSessionLike | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    ort = await loadOrt();
    const ortLoaded = ort;
    const bytes = await fetch(MODEL_URL).then((res) => {
      if (!res.ok) throw new Error(`model fetch ${res.status}`);
      return res.arrayBuffer();
    });

    const createSession = async (
      executionProviders: string[]
    ): Promise<OrtSessionLike> =>
      ortLoaded.InferenceSession.create(new Uint8Array(bytes), { executionProviders });

    // Runtime pick: navigator.gpu → WebGPU session with wasm fallback EP;
    // on failure fall back to a wasm-only session; both failing = unavailable.
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        session = await createSession(["webgpu", "wasm"]);
        runtime = "ORT_WEB_WEBGPU";
      } catch {
        session = null;
      }
    }
    if (!session) {
      session = await createSession(["wasm"]);
      runtime = "ORT_WEB_WASM";
    }

    canvas = document.createElement("canvas");
    canvas.width = MODEL.inputSize;
    canvas.height = MODEL.inputSize;
    status = "running";
  } catch {
    status = "unavailable";
    session = null;
    canvas = null;
    runtime = null;
  }

  const inputName = "images";
  const outputName = "output0";

  return {
    get status() {
      return status;
    },
    get runtime() {
      return runtime;
    },
    async detect(video: HTMLVideoElement): Promise<DetectionFrame | null> {
      if (status !== "running" || !ort || !session || !canvas || runtime == null) {
        return null;
      }
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      if (srcW <= 0 || srcH <= 0) return null; // no decoded frame yet

      const t0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const geom = letterboxGeometry(srcW, srcH);
      // Pad fill rgb(114,114,114) everywhere, then the centered image.
      ctx.fillStyle = "rgb(114,114,114)";
      ctx.fillRect(0, 0, MODEL.inputSize, MODEL.inputSize);
      ctx.drawImage(video, geom.dx, geom.dy, geom.destW, geom.destH);

      const imageData = ctx.getImageData(0, 0, MODEL.inputSize, MODEL.inputSize);
      const chw = rgbaToChw(imageData.data);

      const results = await session.run({
        [inputName]: new ort.Tensor("float32", chw, [1, 3, MODEL.inputSize, MODEL.inputSize]),
      });
      const output = results[outputName];
      if (!output) return null;

      const rows = output.dims.length >= 2 ? output.dims[output.dims.length - 2] : 0;
      const detections = parseModelOutput(
        output.data as Float32Array,
        rows,
        geom,
        srcW,
        srcH
      );

      const t1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      return {
        detections,
        frameWidth: srcW,
        frameHeight: srcH,
        processingMs: Math.max(0, Math.round(t1 - t0)),
        capturedAt: t0,
        runtime,
      };
    },
    async release(): Promise<void> {
      if (status === "released") return;
      status = "released";
      const s = session;
      session = null;
      canvas = null;
      if (s) await s.release().catch(() => undefined);
    },
  };
}
