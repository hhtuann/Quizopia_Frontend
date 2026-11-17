/**
 * Gaze pipeline — PURE math and state (no DOM, no onnxruntime, no clock).
 *
 * Pipeline: YOLO11n-face (face boxes) → MobileGaze / MobileOne-S0 (yaw +
 * pitch of the largest face) → {@link GazeTracker} (baseline calibration,
 * median smoothing, sustained "looking away" episodes).
 *
 * Everything here is unit-tested directly; the ONNX sessions live in
 * gaze-adapter.ts. A gaze estimate is an OBSERVATION for teacher review —
 * never a verdict (ADR-008 D8).
 */

/* ------------------------------------------------------------------ */
/* Model I/O constants (measured from the artifacts, see MODELCARD).   */
/* ------------------------------------------------------------------ */

/** YOLO11n-face input side (letterboxed, RGB /255). */
export const FACE_INPUT_SIZE = 640;
/** MobileGaze input side (face crop, RGB ImageNet-normalized). */
export const GAZE_INPUT_SIZE = 448;
export const IMAGENET_MEAN: readonly [number, number, number] = [0.485, 0.456, 0.406];
export const IMAGENET_STD: readonly [number, number, number] = [0.229, 0.224, 0.225];
/** Gaze head: 90 bins of 4°, offset -180° (Gaze360 binning). */
export const GAZE_BINS = 90;
export const GAZE_BIN_WIDTH_DEG = 4;
export const GAZE_ANGLE_OFFSET_DEG = 180;

/** Face detector thresholds. */
export const FACE_MIN_SCORE = 0.5;
export const FACE_NMS_IOU = 0.45;
export const MAX_FACES = 5;

/**
 * classId carried by gaze payload boxes on the wire. Deliberately outside
 * the COCO range (0..79) of yolo26s so a face box is never rendered as a
 * COCO class by a consumer.
 */
export const GAZE_FACE_CLASS_ID = 1000;

/* ------------------------------------------------------------------ */
/* Tensor / decode helpers.                                            */
/* ------------------------------------------------------------------ */

/**
 * RGBA (HWC, 0..255) → Float32 CHW, `(x/255 - mean) / std` per channel.
 * Without mean/std this is the plain `/255` Ultralytics convention.
 */
export function rgbaToNormalizedChw(
  rgba: Uint8ClampedArray | Uint8Array,
  size: number,
  mean?: readonly number[],
  std?: readonly number[]
): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let c = 0; c < 3; c++) {
    const m = mean ? mean[c] : 0;
    const s = std ? std[c] : 1;
    const offset = c * plane;
    for (let i = 0; i < plane; i++) {
      out[offset + i] = (rgba[i * 4 + c] / 255 - m) / s;
    }
  }
  return out;
}

/** Letterbox placement used when the face-model input was drawn. */
export interface LetterboxPlacement {
  scale: number;
  dx: number;
  dy: number;
}

/** A face box in SOURCE-frame pixel coordinates. */
export interface FaceBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union =
    (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Decode YOLO11n-face `output0` `[1,5,N]` — channel-major rows
 * `(cx, cy, w, h, score)` in letterbox pixel coords, NO built-in NMS
 * (unlike yolo26s). Returns source-pixel boxes after greedy NMS, sorted
 * LARGEST AREA first (the largest face is the test taker).
 */
export function decodeFaceOutput(
  data: Float32Array,
  numAnchors: number,
  geom: LetterboxPlacement,
  srcW: number,
  srcH: number,
  minScore = FACE_MIN_SCORE,
  iouThreshold = FACE_NMS_IOU
): FaceBox[] {
  const n = numAnchors;
  const candidates: FaceBox[] = [];
  for (let i = 0; i < n; i++) {
    const score = data[4 * n + i];
    if (!(score >= minScore)) continue;
    const cx = data[i];
    const cy = data[n + i];
    const w = data[2 * n + i];
    const h = data[3 * n + i];
    const x1 = Math.max(0, (cx - w / 2 - geom.dx) / geom.scale);
    const y1 = Math.max(0, (cy - h / 2 - geom.dy) / geom.scale);
    const x2 = Math.min(srcW, (cx + w / 2 - geom.dx) / geom.scale);
    const y2 = Math.min(srcH, (cy + h / 2 - geom.dy) / geom.scale);
    if (x2 - x1 < 2 || y2 - y1 < 2) continue;
    candidates.push({ x1, y1, x2, y2, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const c of candidates) {
    if (kept.every((k) => iou(k, c) < iouThreshold)) kept.push(c);
    if (kept.length >= MAX_FACES) break;
  }
  kept.sort(
    (a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1)
  );
  return kept;
}

/** Softmax expectation over the bin index (numerically stable). */
function expectedBin(logits: ArrayLike<number>): number {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  let acc = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - max);
    sum += e;
    acc += e * i;
  }
  return acc / sum;
}

/** Gaze logits → angles in degrees (yaw = horizontal, pitch = vertical). */
export function decodeGaze(
  yawLogits: ArrayLike<number>,
  pitchLogits: ArrayLike<number>
): { yaw: number; pitch: number } {
  return {
    yaw: expectedBin(yawLogits) * GAZE_BIN_WIDTH_DEG - GAZE_ANGLE_OFFSET_DEG,
    pitch: expectedBin(pitchLogits) * GAZE_BIN_WIDTH_DEG - GAZE_ANGLE_OFFSET_DEG,
  };
}

export function median(values: number[]): number {
  const a = values.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/* ------------------------------------------------------------------ */
/* Looking-away classification.                                        */
/* ------------------------------------------------------------------ */

export type GazeDirection = "left" | "right" | "up" | "down";

export interface GazeSettings {
  /** Horizontal deviation from the baseline that counts as away (deg). */
  yawThresholdDeg: number;
  /** Looking-down deviation from the baseline (deg). */
  downThresholdDeg: number;
  /** Looking-up deviation from the baseline (deg). */
  upThresholdDeg: number;
  /** Continuous away time before an episode is reported (s). */
  awaySeconds: number;
  /** Share of the sliding window spent away that reports "repeated" (%). */
  frequentPercent: number;
  /** Sliding window length for the repeated-away rule (s). */
  frequentWindowSeconds: number;
  /** Median smoothing span for the angles (s). */
  smoothSeconds: number;
  /** A face narrower than this (source px) gives no trustworthy gaze. */
  minFaceWidthPx: number;
  /** Baseline sampling span after the first valid gaze (s). */
  calibrationSeconds: number;
  /** Minimum valid samples before the baseline is accepted. */
  calibrationMinSamples: number;
  /** The auto baseline is clamped to ± this many degrees. */
  baselineLimitDeg: number;
}

/**
 * Defaults follow the reference demo (25°/20°/20°, 3s sustained, 20% of a
 * 60s window). `minFaceWidthPx` is set for the 640×480 camera capture of
 * the attempt page (the demo used 100px at 1280 wide): on a ~90px face the
 * estimate was seen to move by ~10° with the resampling method alone, so
 * smaller faces are not trusted.
 */
export const DEFAULT_GAZE_SETTINGS: GazeSettings = {
  yawThresholdDeg: 25,
  downThresholdDeg: 20,
  upThresholdDeg: 20,
  awaySeconds: 3,
  frequentPercent: 20,
  frequentWindowSeconds: 60,
  smoothSeconds: 1,
  minFaceWidthPx: 80,
  calibrationSeconds: 3,
  calibrationMinSamples: 4,
  baselineLimitDeg: 20,
};

/**
 * Deviation from the baseline → the direction exceeding its threshold the
 * most, or null while still "on screen".
 *
 * Directions are from the TEST TAKER's own perspective on the UNMIRRORED
 * camera frame the models analyze: positive yaw points to image-left,
 * which is the test taker's right. (The reference demo analyzes a mirrored
 * preview, where the sign is flipped.) Positive pitch = looking up.
 */
export function classifyGaze(
  deltaYaw: number,
  deltaPitch: number,
  settings: GazeSettings = DEFAULT_GAZE_SETTINGS
): GazeDirection | null {
  const h = Math.abs(deltaYaw) / settings.yawThresholdDeg;
  const v =
    deltaPitch < 0
      ? -deltaPitch / settings.downThresholdDeg
      : deltaPitch / settings.upThresholdDeg;
  if (h <= 1 && v <= 1) return null;
  if (h >= v) return deltaYaw > 0 ? "right" : "left";
  return deltaPitch < 0 ? "down" : "up";
}

/* ------------------------------------------------------------------ */
/* Observation + tracker.                                              */
/* ------------------------------------------------------------------ */

/** One analyzed frame's gaze reading (produced by the gaze adapter). */
export interface GazeObservation {
  /** Faces found by the face detector (0 = none). */
  faceCount: number;
  /** Largest face, normalized 0..1 to the source frame; null when none. */
  faceBox: [number, number, number, number] | null;
  /** Face detector score of that face (0..1). */
  faceScore: number | null;
  /** Width of that face in SOURCE pixels. */
  faceWidthPx: number;
  /** Raw model angles (deg); null when no usable face. */
  yaw: number | null;
  pitch: number | null;
  /** Face detect + gaze estimate, pre/post included (ms). */
  processingMs: number;
  runtime: "ORT_WEB_WASM" | "ORT_WEB_WEBGPU";
}

export type GazeTrackerState =
  | "calibrating"
  | "ok"
  | "away"
  | "no_face"
  | "face_too_small";

export type GazeReportKind = "sustained" | "frequent";

/** A reportable looking-away finding for the current frame. */
export interface GazeReport {
  kind: GazeReportKind;
  /** Dominant direction (sustained: of the episode; frequent: latest). */
  direction: GazeDirection | null;
  /** Largest deviation seen in the episode / current deviation (deg). */
  deltaYaw: number;
  deltaPitch: number;
  /** Episode duration so far (sustained) or away time in window (s). */
  seconds: number;
}

export interface GazeUpdate {
  state: GazeTrackerState;
  calibrated: boolean;
  direction: GazeDirection | null;
  /** Smoothed deviation from the baseline; null without a usable gaze. */
  deltaYaw: number | null;
  deltaPitch: number | null;
  /**
   * Set on EVERY frame while a sustained episode is past the threshold
   * (the caller paces the wire), and once per window for "frequent".
   */
  report: GazeReport | null;
}

/**
 * A sustained episode survives condition gaps shorter than this, so a few
 * noisy frames around the threshold neither split nor reset it.
 */
export const AWAY_GAP_SECONDS = 1;

interface AwayEpisode {
  start: number;
  lastAway: number;
  counts: Partial<Record<GazeDirection, number>>;
  maxYaw: number;
  maxPitch: number;
}

/**
 * Pure state machine: feed one observation per analyzed frame with a
 * monotonic-ish timestamp in seconds; it calibrates the baseline, smooths
 * the angles and reports looking-away findings.
 *
 * Auto-calibration: the baseline is the median of the valid samples seen
 * in the first `calibrationSeconds` (the test taker has just opened the
 * exam and is reading the screen), clamped to ±`baselineLimitDeg` so a
 * bad start cannot move the "on screen" zone arbitrarily far.
 */
export class GazeTracker {
  readonly settings: GazeSettings;
  private baseline: { yaw: number; pitch: number } | null = null;
  private calibStart: number | null = null;
  private calibSamples: { yaw: number; pitch: number }[] = [];
  private samples: { t: number; yaw: number; pitch: number }[] = [];
  private window: { t: number; dt: number; away: boolean }[] = [];
  private episode: AwayEpisode | null = null;
  private firstT: number | null = null;
  private prevT: number | null = null;
  private lastFrequentAt = -Infinity;

  constructor(settings: Partial<GazeSettings> = {}) {
    this.settings = { ...DEFAULT_GAZE_SETTINGS, ...settings };
  }

  get calibrated(): boolean {
    return this.baseline != null;
  }

  /** The accepted baseline (deg), or null while calibrating. */
  get baselineAngles(): { yaw: number; pitch: number } | null {
    return this.baseline ? { ...this.baseline } : null;
  }

  update(t: number, obs: GazeObservation): GazeUpdate {
    const s = this.settings;
    const usable =
      obs.faceCount > 0 &&
      obs.yaw != null &&
      obs.pitch != null &&
      obs.faceWidthPx >= s.minFaceWidthPx;

    if (!this.baseline) {
      if (usable) this.calibrate(t, obs.yaw as number, obs.pitch as number);
      if (!this.baseline) {
        return {
          state: "calibrating",
          calibrated: false,
          direction: null,
          deltaYaw: null,
          deltaPitch: null,
          report: null,
        };
      }
    }

    if (this.firstT === null) this.firstT = t;
    const dt =
      this.prevT === null ? 0 : Math.min(Math.max(t - this.prevT, 0), 1);
    this.prevT = t;

    let state: GazeTrackerState = "ok";
    let deltaYaw: number | null = null;
    let deltaPitch: number | null = null;
    let direction: GazeDirection | null = null;

    if (obs.faceCount <= 0) {
      state = "no_face";
    } else if (!usable) {
      state = "face_too_small";
    } else {
      this.samples.push({ t, yaw: obs.yaw as number, pitch: obs.pitch as number });
      while (this.samples.length > 1 && t - this.samples[0].t > s.smoothSeconds) {
        this.samples.shift();
      }
      deltaYaw = median(this.samples.map((p) => p.yaw)) - this.baseline.yaw;
      deltaPitch = median(this.samples.map((p) => p.pitch)) - this.baseline.pitch;
      direction = classifyGaze(deltaYaw, deltaPitch, s);
      if (direction) state = "away";
    }
    if (state === "no_face" || state === "face_too_small") this.samples.length = 0;

    let report: GazeReport | null = null;

    // Sustained episode.
    if (state === "away" && direction && deltaYaw != null && deltaPitch != null) {
      if (!this.episode) {
        this.episode = { start: t, lastAway: t, counts: {}, maxYaw: deltaYaw, maxPitch: deltaPitch };
      }
      const ep = this.episode;
      ep.lastAway = t;
      ep.counts[direction] = (ep.counts[direction] ?? 0) + 1;
      if (Math.abs(deltaYaw) > Math.abs(ep.maxYaw)) ep.maxYaw = deltaYaw;
      if (Math.abs(deltaPitch) > Math.abs(ep.maxPitch)) ep.maxPitch = deltaPitch;
      if (t - ep.start >= s.awaySeconds) {
        report = {
          kind: "sustained",
          direction: dominantDirection(ep.counts),
          deltaYaw: ep.maxYaw,
          deltaPitch: ep.maxPitch,
          seconds: t - ep.start,
        };
      }
    } else if (this.episode && t - this.episode.lastAway > AWAY_GAP_SECONDS) {
      this.episode = null;
    }

    // Repeated looking away: total away time inside the sliding window.
    this.window.push({ t, dt, away: state === "away" });
    while (this.window.length && t - this.window[0].t > s.frequentWindowSeconds) {
      this.window.shift();
    }
    // Reported only on a frame that has a face, so the event always
    // carries the face box it refers to.
    if (!report && obs.faceCount > 0) {
      let awayTime = 0;
      for (const w of this.window) if (w.away) awayTime += w.dt;
      const pct = (awayTime / s.frequentWindowSeconds) * 100;
      if (
        t - this.firstT >= s.frequentWindowSeconds &&
        pct >= s.frequentPercent &&
        t - this.lastFrequentAt >= s.frequentWindowSeconds
      ) {
        this.lastFrequentAt = t;
        report = {
          kind: "frequent",
          direction,
          deltaYaw: deltaYaw ?? 0,
          deltaPitch: deltaPitch ?? 0,
          seconds: awayTime,
        };
      }
    }

    return { state, calibrated: true, direction, deltaYaw, deltaPitch, report };
  }

  private calibrate(t: number, yaw: number, pitch: number): void {
    const s = this.settings;
    if (this.calibStart === null) this.calibStart = t;
    this.calibSamples.push({ yaw, pitch });
    if (
      t - this.calibStart < s.calibrationSeconds ||
      this.calibSamples.length < s.calibrationMinSamples
    ) {
      return;
    }
    const clamp = (v: number): number =>
      Math.min(s.baselineLimitDeg, Math.max(-s.baselineLimitDeg, v));
    this.baseline = {
      yaw: clamp(median(this.calibSamples.map((p) => p.yaw))),
      pitch: clamp(median(this.calibSamples.map((p) => p.pitch))),
    };
    this.calibSamples = [];
  }
}

function dominantDirection(
  counts: Partial<Record<GazeDirection, number>>
): GazeDirection | null {
  let best: GazeDirection | null = null;
  let bestCount = 0;
  for (const key of Object.keys(counts) as GazeDirection[]) {
    const c = counts[key] ?? 0;
    if (c > bestCount) {
      best = key;
      bestCount = c;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Wire label (payload box `label`, ≤32 chars on the backend).         */
/* ------------------------------------------------------------------ */

export interface GazeLabelInfo {
  /** "frequent" marks the repeated-away rule. */
  direction: GazeDirection | "frequent";
  /** Rounded deviation from the baseline (deg). */
  deltaYaw: number;
  deltaPitch: number;
}

const LABEL_DIRECTIONS = new Set(["left", "right", "up", "down", "frequent"]);

/** `gaze:<direction>:<yaw>:<pitch>` — e.g. `gaze:left:-32:4` (≤24 chars). */
export function formatGazeLabel(info: GazeLabelInfo): string {
  const clampDeg = (v: number): number =>
    Math.max(-180, Math.min(180, Math.round(Number.isFinite(v) ? v : 0)));
  // `+ 0` normalizes -0 so the label never reads "-0".
  return `gaze:${info.direction}:${clampDeg(info.deltaYaw) + 0}:${clampDeg(info.deltaPitch) + 0}`;
}

/** Inverse of {@link formatGazeLabel}; null for any other label. */
export function parseGazeLabel(label: string | null | undefined): GazeLabelInfo | null {
  if (!label) return null;
  const parts = label.split(":");
  if (parts.length !== 4 || parts[0] !== "gaze" || !LABEL_DIRECTIONS.has(parts[1])) {
    return null;
  }
  if (!/^-?\d{1,3}$/.test(parts[2]) || !/^-?\d{1,3}$/.test(parts[3])) return null;
  return {
    direction: parts[1] as GazeLabelInfo["direction"],
    deltaYaw: Number(parts[2]),
    deltaPitch: Number(parts[3]),
  };
}
