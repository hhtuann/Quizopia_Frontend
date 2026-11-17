import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAZE_SETTINGS,
  GAZE_BINS,
  GazeTracker,
  classifyGaze,
  decodeFaceOutput,
  decodeGaze,
  formatGazeLabel,
  median,
  parseGazeLabel,
  rgbaToNormalizedChw,
  type GazeObservation,
} from "./gaze-core";

/**
 * Gaze pipeline pure core: tensor normalization, YOLO11n-face decode + NMS,
 * gaze bin decode, away classification, the tracker's calibration /
 * sustained / repeated rules, and the wire label round-trip. No ONNX and
 * no DOM here — the numbers are hand-built.
 */

/** Logits with a sharp peak at `bin`. */
function peak(bin: number): Float32Array {
  const logits = new Float32Array(GAZE_BINS).fill(-20);
  logits[bin] = 20;
  return logits;
}

/** A usable observation (one 200px face) with the given raw angles. */
function obs(yaw: number | null, pitch: number | null, over: Partial<GazeObservation> = {}): GazeObservation {
  return {
    faceCount: 1,
    faceBox: [0.3, 0.2, 0.6, 0.7],
    faceScore: 0.9,
    faceWidthPx: 200,
    yaw,
    pitch,
    processingMs: 40,
    runtime: "ORT_WEB_WASM",
    ...over,
  };
}

/** Feed `seconds` of identical observations at `fps`, return the updates. */
function feed(
  tracker: GazeTracker,
  from: number,
  seconds: number,
  o: GazeObservation,
  fps = 2
) {
  const updates = [];
  const step = 1 / fps;
  for (let t = from; t <= from + seconds + 1e-9; t += step) {
    updates.push({ t, u: tracker.update(t, o) });
  }
  return updates;
}

/** A tracker already calibrated to baseline (0°, 0°) at t=4. */
function calibrated(): GazeTracker {
  const tracker = new GazeTracker();
  feed(tracker, 0, 4, obs(0, 0));
  expect(tracker.calibrated).toBe(true);
  return tracker;
}

describe("rgbaToNormalizedChw", () => {
  it("plain /255 CHW without mean/std", () => {
    const out = rgbaToNormalizedChw(new Uint8ClampedArray([255, 0, 51, 255]), 1);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(51 / 255); // float32 storage
  });

  it("applies (x/255 - mean) / std per channel, planes in R,G,B order", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const out = rgbaToNormalizedChw(rgba, 2, [0.5, 0.25, 0], [0.5, 0.25, 1]);
    // First pixel of each plane is white; the rest black.
    expect(out[0]).toBeCloseTo(1); // (1-0.5)/0.5
    expect(out[1]).toBeCloseTo(-1); // (0-0.5)/0.5
    expect(out[4]).toBeCloseTo(3); // (1-0.25)/0.25
    expect(out[8]).toBeCloseTo(1); // (1-0)/1
  });
});

describe("decodeFaceOutput (output0 [1,5,N], channel-major)", () => {
  /** Build channel-major data from row-major anchors [cx,cy,w,h,score]. */
  function pack(rows: number[][]): Float32Array {
    const n = rows.length;
    const data = new Float32Array(5 * n);
    rows.forEach((r, i) => r.forEach((v, c) => (data[c * n + i] = v)));
    return data;
  }
  // 640×480 source → scale 1, dy 80 (letterbox top/bottom bars).
  const geom = { scale: 1, dx: 0, dy: 80 };

  it("un-letterboxes to source pixels and drops low scores", () => {
    const data = pack([
      [320, 320, 100, 120, 0.9],
      [100, 200, 50, 50, 0.3], // below 0.5
    ]);
    const faces = decodeFaceOutput(data, 2, geom, 640, 480);
    expect(faces).toHaveLength(1);
    expect(faces[0]).toEqual({ x1: 270, y1: 180, x2: 370, y2: 300, score: expect.closeTo(0.9, 5) });
  });

  it("NMS keeps the best of overlapping boxes; result is largest-area first", () => {
    const data = pack([
      [320, 320, 100, 100, 0.8], // overlaps the next (lower score → dropped)
      [322, 322, 100, 100, 0.95],
      [100, 200, 200, 200, 0.6], // separate, biggest → first
    ]);
    const faces = decodeFaceOutput(data, 3, geom, 640, 480);
    expect(faces).toHaveLength(2);
    expect(faces[0].score).toBeCloseTo(0.6);
    expect(faces[1].score).toBeCloseTo(0.95);
  });

  it("clamps to the frame and ignores degenerate boxes", () => {
    const data = pack([
      [5, 85, 40, 40, 0.9], // spills past the top-left corner
      [300, 300, 1, 1, 0.9], // < 2px
    ]);
    const faces = decodeFaceOutput(data, 2, geom, 640, 480);
    expect(faces).toHaveLength(1);
    expect(faces[0].x1).toBe(0);
    expect(faces[0].y1).toBe(0);
  });
});

describe("decodeGaze", () => {
  it("bin 45 is 0°, each bin is 4° (offset -180°)", () => {
    expect(decodeGaze(peak(45), peak(45))).toEqual({ yaw: 0, pitch: 0 });
    const g = decodeGaze(peak(52), peak(40));
    expect(g.yaw).toBeCloseTo(28);
    expect(g.pitch).toBeCloseTo(-20);
  });

  it("is a softmax expectation, not an argmax", () => {
    const logits = new Float32Array(GAZE_BINS).fill(-50);
    logits[45] = 0;
    logits[46] = 0; // equal mass on 0° and 4° → 2°
    expect(decodeGaze(logits, peak(45)).yaw).toBeCloseTo(2);
  });
});

describe("classifyGaze", () => {
  it("inside every threshold → null (on screen)", () => {
    expect(classifyGaze(25, 20)).toBeNull();
    expect(classifyGaze(-25, -20)).toBeNull();
  });

  it("directions are the test taker's own, on the unmirrored frame", () => {
    expect(classifyGaze(30, 0)).toBe("right");
    expect(classifyGaze(-30, 0)).toBe("left");
    expect(classifyGaze(0, 25)).toBe("up");
    expect(classifyGaze(0, -25)).toBe("down");
  });

  it("picks the axis that exceeds its threshold the most", () => {
    // yaw 30/25 = 1.2 ; down 40/20 = 2 → down
    expect(classifyGaze(30, -40)).toBe("down");
  });
});

describe("median", () => {
  it("odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("GazeTracker", () => {
  it("calibrates from the first seconds of valid samples and reports nothing meanwhile", () => {
    const tracker = new GazeTracker();
    const early = tracker.update(0, obs(8, -6));
    expect(early.state).toBe("calibrating");
    expect(early.report).toBeNull();
    feed(tracker, 0.5, 3, obs(8, -6));
    expect(tracker.calibrated).toBe(true);
    expect(tracker.baselineAngles).toEqual({ yaw: 8, pitch: -6 });
  });

  it("needs the minimum sample count even after the time span", () => {
    const tracker = new GazeTracker();
    tracker.update(0, obs(0, 0));
    tracker.update(10, obs(0, 0)); // span ok, only 2 samples
    expect(tracker.calibrated).toBe(false);
    tracker.update(10.5, obs(0, 0));
    tracker.update(11, obs(0, 0));
    expect(tracker.calibrated).toBe(true);
  });

  it("unusable frames (no face / tiny face) never count toward the baseline", () => {
    const tracker = new GazeTracker();
    feed(tracker, 0, 5, obs(null, null, { faceCount: 0, faceBox: null, faceScore: null, faceWidthPx: 0 }));
    feed(tracker, 6, 5, obs(40, 0, { faceWidthPx: 20 }));
    expect(tracker.calibrated).toBe(false);
  });

  it("clamps a bad-start baseline to the limit", () => {
    const tracker = new GazeTracker();
    feed(tracker, 0, 4, obs(60, -45));
    const limit = DEFAULT_GAZE_SETTINGS.baselineLimitDeg;
    expect(tracker.baselineAngles).toEqual({ yaw: limit, pitch: -limit });
  });

  it("deviation is measured from the baseline, not from 0°", () => {
    const tracker = new GazeTracker();
    feed(tracker, 0, 4, obs(10, 0));
    // 30° raw is only 20° off a 10° baseline → still on screen.
    const u = feed(tracker, 5, 2, obs(30, 0)).pop()!.u;
    expect(u.state).toBe("ok");
    expect(u.deltaYaw).toBeCloseTo(20);
  });

  it("reports a sustained episode only after awaySeconds, then on every frame", () => {
    const tracker = calibrated();
    const updates = feed(tracker, 10, 6, obs(-40, 0));
    const firstReport = updates.find((x) => x.u.report);
    expect(firstReport).toBeDefined();
    // Median smoothing (1s) delays the first away frame slightly; the
    // report must not come before 3s of away and must come soon after.
    const firstAway = updates.find((x) => x.u.state === "away")!;
    expect(firstReport!.t - firstAway.t).toBeGreaterThanOrEqual(DEFAULT_GAZE_SETTINGS.awaySeconds);
    expect(firstReport!.t - firstAway.t).toBeLessThan(DEFAULT_GAZE_SETTINGS.awaySeconds + 0.6);
    expect(firstReport!.u.report).toEqual(
      expect.objectContaining({ kind: "sustained", direction: "left" })
    );
    expect(firstReport!.u.report!.deltaYaw).toBeCloseTo(-40);
    // Still reporting at the end of the episode.
    expect(updates[updates.length - 1].u.report?.kind).toBe("sustained");
  });

  it("a short glance never reports", () => {
    const tracker = calibrated();
    const updates = feed(tracker, 10, 2, obs(40, 0));
    expect(updates.some((x) => x.u.report)).toBe(false);
    const back = feed(tracker, 12.5, 5, obs(0, 0));
    expect(back.some((x) => x.u.report)).toBe(false);
  });

  it("a gap under 1s does not reset the episode; a longer one does", () => {
    const tracker = calibrated();
    feed(tracker, 10, 2, obs(40, 0)); // away ~1.5–2s
    tracker.update(12.5, obs(null, null, { faceCount: 0, faceBox: null, faceScore: null, faceWidthPx: 0 }));
    // Back to away quickly: the episode continues and crosses 3s.
    const resumed = feed(tracker, 13, 2, obs(40, 0));
    expect(resumed.some((x) => x.u.report?.kind === "sustained")).toBe(true);

    const tracker2 = calibrated();
    feed(tracker2, 10, 2, obs(40, 0));
    feed(tracker2, 12.5, 3, obs(0, 0)); // > 1s on screen → reset
    const again = feed(tracker2, 16, 2, obs(40, 0));
    expect(again.some((x) => x.u.report)).toBe(false);
  });

  it("no face / tiny face are their own states and never 'away'", () => {
    const tracker = calibrated();
    expect(
      tracker.update(10, obs(null, null, { faceCount: 0, faceBox: null, faceScore: null, faceWidthPx: 0 })).state
    ).toBe("no_face");
    expect(tracker.update(10.5, obs(50, 0, { faceWidthPx: 30 })).state).toBe("face_too_small");
  });

  it("repeated short glances report 'frequent' once per window", () => {
    const tracker = calibrated();
    const reports: { t: number; kind: string }[] = [];
    // 5s cycle: ~2s away (under the 3s sustained bar), 3s on screen —
    // well over 20% of the 60s window, but never one long episode.
    let t = 10;
    while (t < 150) {
      for (const x of feed(tracker, t, 2, obs(40, 0))) {
        if (x.u.report) reports.push({ t: x.t, kind: x.u.report.kind });
      }
      for (const x of feed(tracker, t + 2.5, 2, obs(0, 0))) {
        if (x.u.report) reports.push({ t: x.t, kind: x.u.report.kind });
      }
      t += 5;
    }
    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(reports.every((r) => r.kind === "frequent")).toBe(true);
    // Not before one full window has elapsed, and at most one per window.
    expect(reports[0].t).toBeGreaterThanOrEqual(4 + DEFAULT_GAZE_SETTINGS.frequentWindowSeconds - 1);
    for (let i = 1; i < reports.length; i++) {
      expect(reports[i].t - reports[i - 1].t).toBeGreaterThanOrEqual(
        DEFAULT_GAZE_SETTINGS.frequentWindowSeconds
      );
    }
  });
});

describe("gaze wire label", () => {
  it("round-trips direction and rounded deviation", () => {
    const label = formatGazeLabel({ direction: "left", deltaYaw: -31.6, deltaPitch: 4.2 });
    expect(label).toBe("gaze:left:-32:4");
    expect(parseGazeLabel(label)).toEqual({ direction: "left", deltaYaw: -32, deltaPitch: 4 });
  });

  it("stays within the backend's 32-char label limit at the extremes", () => {
    const label = formatGazeLabel({ direction: "frequent", deltaYaw: -999, deltaPitch: -999 });
    expect(label).toBe("gaze:frequent:-180:-180");
    expect(label.length).toBeLessThanOrEqual(32);
  });

  it("never writes -0 or NaN", () => {
    expect(formatGazeLabel({ direction: "up", deltaYaw: -0.2, deltaPitch: Number.NaN })).toBe(
      "gaze:up:0:0"
    );
  });

  it("rejects non-gaze labels", () => {
    expect(parseGazeLabel("cell phone")).toBeNull();
    expect(parseGazeLabel("gaze:sideways:1:2")).toBeNull();
    expect(parseGazeLabel("gaze:left:abc:2")).toBeNull();
    expect(parseGazeLabel(null)).toBeNull();
  });
});
