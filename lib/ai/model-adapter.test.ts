// @vitest-environment jsdom
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODEL,
  letterboxGeometry,
  unletterboxBox,
  parseModelOutput,
  rgbaToChw,
} from "./model-adapter";

/**
 * P4-C pure model-adapter math (CONTRACT §7): letterbox geometry for
 * portrait/landscape/square frames, un-letterbox roundtrip, and the
 * [1,300,6] output0 parse (score filtering, class mapping, clamping).
 * The real onnxruntime-web module is NEVER loaded here — createDetector is
 * not under test in vitest.
 */


describe("letterboxGeometry", () => {
  it("portrait 480×640 letterboxes with vertical padding", () => {
    const g = letterboxGeometry(480, 640);
    expect(g.scale).toBeCloseTo(1); // 640/640 < 640/480 → 1
    expect(g.destW).toBe(480);
    expect(g.destH).toBe(640);
    expect(g.dx).toBe(80); // (640-480)/2
    expect(g.dy).toBe(0);
  });

  it("landscape 1280×720 letterboxes with horizontal padding", () => {
    const g = letterboxGeometry(1280, 720);
    expect(g.scale).toBeCloseTo(0.5); // 640/1280 < 640/720
    expect(g.destW).toBe(640);
    expect(g.destH).toBe(360);
    expect(g.dx).toBe(0);
    expect(g.dy).toBe(140); // (640-360)/2
  });

  it("square 640×640 fills the canvas exactly", () => {
    const g = letterboxGeometry(640, 640);
    expect(g).toMatchObject({ scale: 1, dx: 0, dy: 0, destW: 640, destH: 640 });
  });

  it("upscales small frames (min scale > 1)", () => {
    const g = letterboxGeometry(320, 240);
    expect(g.scale).toBeCloseTo(2);
    expect(g.destW).toBe(640);
    expect(g.destH).toBe(480);
  });
});

describe("unletterboxBox roundtrip", () => {
  const cases: [string, number, number][] = [
    ["portrait", 480, 640],
    ["landscape", 1280, 720],
    ["square", 640, 640],
  ];

  for (const [name, w, h] of cases) {
    it(`${name}: source corners map through letterbox→un-letterbox unchanged`, () => {
      const g = letterboxGeometry(w, h);
      // Top-left and bottom-right of the SOURCE image in letterbox pixels.
      const tl: [number, number, number, number] = [g.dx, g.dy, 0, 0];
      const br: [number, number, number, number] = [
        g.dx + g.destW,
        g.dy + g.destH,
        0,
        0,
      ];
      expect(unletterboxBox(tl, g, w, h)).toEqual([0, 0, 0, 0]);
      const roundBr = unletterboxBox(br, g, w, h);
      expect(roundBr[0]).toBeCloseTo(1, 5);
      expect(roundBr[1]).toBeCloseTo(1, 5);

      // An interior point maps back to its source-normalized position.
      const cx = g.dx + g.destW / 2;
      const cy = g.dy + g.destH / 2;
      const center = unletterboxBox([cx, cy, cx, cy], g, w, h);
      expect(center[0]).toBeCloseTo(0.5, 5);
      expect(center[1]).toBeCloseTo(0.5, 5);
    });
  }

  it("clamps letterbox PAD regions into 0..1 instead of going negative", () => {
    const g = letterboxGeometry(1280, 720); // dx=0, dy=140
    const box = unletterboxBox([0, 0, 10, 10], g, 1280, 720);
    expect(box[0]).toBeGreaterThanOrEqual(0);
    expect(box[1]).toBe(0); // (0-140)/0.5/720 < 0 → clamped
    expect(box.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});

describe("parseModelOutput [1,300,6]", () => {
  const ROWS = 300;

  function makeOutput(
    rows: Array<[number, number, number, number, number, number]>
  ): Float32Array {
    const data = new Float32Array(ROWS * 6);
    rows.forEach((row, i) => data.set(row, i * 6));
    return data;
  }

  it("maps class ids to labels and filters by score", () => {
    const g = letterboxGeometry(1280, 720);
    const output = makeOutput([
      // [x1, y1, x2, y2, score, classId]
      [100, 100, 200, 300, 0.9, 67], // phone, kept
      [0, 0, 640, 640, 0.99, 62], // tv, kept
      [50, 50, 150, 400, 0.42, 63], // laptop BELOW 0.5 → dropped
      [10, 10, 300, 600, 0.6, 0], // person ≥0.4 → kept
      [10, 10, 300, 600, 0.45, 0], // person ≥0.4 (absence bar) → kept
      [10, 10, 300, 600, 0.35, 0], // person below 0.4 → dropped
      [10, 10, 300, 600, 0.99, 15], // irrelevant COCO class → dropped
    ]);
    const detections = parseModelOutput(output, ROWS, g, 1280, 720);
    expect(detections.map((d) => d.label)).toEqual([
      "cell phone",
      "tv",
      "person",
      "person",
    ]);
    expect(detections.map((d) => d.classId)).toEqual([67, 62, 0, 0]);
    expect(detections.every((d) => d.bbox.every((v) => v >= 0 && v <= 1))).toBe(true);
  });

  it("normalizes boxes to source coordinates (1280×720 landscape)", () => {
    const g = letterboxGeometry(1280, 720); // scale .5, dx 0, dy 140
    const output = makeOutput([
      // Full letterbox canvas box → whole source frame [0,0,1,1].
      [0, 140, 640, 500, 0.8, 67],
    ]);
    const [det] = parseModelOutput(output, ROWS, g, 1280, 720);
    expect(det.bbox[0]).toBeCloseTo(0, 5);
    expect(det.bbox[1]).toBeCloseTo(0, 5);
    expect(det.bbox[2]).toBeCloseTo(1, 5);
    expect(det.bbox[3]).toBeCloseTo(1, 5);
    expect(det.confidence).toBeCloseTo(0.8);
  });

  it("returns an empty list when nothing passes the thresholds", () => {
    const g = letterboxGeometry(480, 640);
    const output = makeOutput([[1, 1, 2, 2, 0.1, 67]]);
    expect(parseModelOutput(output, ROWS, g, 480, 640)).toEqual([]);
  });
});

describe("rgbaToChw", () => {
  it("writes RGB /255 in CHW plane order", () => {
    // 2×2 RGBA image: red, green, blue, white pixels.
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);
    const chw = rgbaToChw(rgba, 2);
    const plane = 4;
    // R plane: [1, 0, 0, 1]
    expect([...chw.slice(0, plane)]).toEqual([1, 0, 0, 1]);
    // G plane: [0, 1, 0, 1]
    expect([...chw.slice(plane, plane * 2)]).toEqual([0, 1, 0, 1]);
    // B plane: [0, 0, 1, 1]
    expect([...chw.slice(plane * 2, plane * 3)]).toEqual([0, 0, 1, 1]);
  });
});

describe("MODEL card constant", () => {
  it("matches the P4-C contract", () => {
    expect(MODEL.id).toBe("yolo26s");
    expect(MODEL.version).toBe("8.4.64-onnx");
    expect(MODEL.inputSize).toBe(640);
    expect(MODEL.classes).toEqual({
      0: "person",
      62: "tv",
      63: "laptop",
      67: "cell phone",
    });
    expect(MODEL.license).toBe("AGPL-3.0");
  });
});


/* ------------------------------------------------------------------ */
/* detect() contract — mocked ort module (never loads real wasm).       */
/* The P0-2 regression: capturedAt MUST be wall-clock epoch ms so the   */
/* backend sanity window accepts it (performance.now() gave 1970 dates  */
/* — masked by every earlier fake because they hand-built frames).      */
/* ------------------------------------------------------------------ */
// vi.mock factories are hoisted into their own module scope and CANNOT
// close over test-scope variables — shared state must go through vi.hoisted.
const ortMock = vi.hoisted(() => {
  const state = { executionProviders: [] as string[] };
  return { state };
});

vi.mock("onnxruntime-web", () => ({
  InferenceSession: {
    create: async (_bytes: unknown, opts?: { executionProviders?: string[] }) => {
      ortMock.state.executionProviders = opts?.executionProviders ?? [];
      return {
        run: async () => ({
          output0: { dims: [1, 300, 6], data: new Float32Array(300 * 6) },
        }),
        release: async () => undefined,
      };
    },
  },
  Tensor: class {
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: number[]
    ) {}
  },
  env: { wasm: { wasmPaths: "" } },
}));

describe("createDetector().detect (mocked ort)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })));
    // jsdom canvas: 2d context + pixel readback stubs.
    const ctx = {
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );
    // Feeder video decodes 640×480 (srcObject stamp pattern).
    Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
      configurable: true,
      set(stream: unknown) {
        (this as HTMLVideoElement & { __s?: unknown }).__s = stream;
        Object.defineProperty(this, "videoWidth", { configurable: true, value: 640 });
        Object.defineProperty(this, "videoHeight", { configurable: true, value: 480 });
        Object.defineProperty(this, "readyState", { configurable: true, value: 2 });
      },
      get() {
        return (this as HTMLVideoElement & { __s?: unknown }).__s ?? null;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a REAL wall-clock capturedAt (P0-2: never performance.now epoch)", async () => {
    const { createDetector } = await import("./model-adapter");
    const det = await createDetector();
    expect(det.status).toBe("running");
    expect(det.runtime).toBe("ORT_WEB_WASM"); // jsdom: no navigator.gpu

    const video = document.createElement("video");
    // jsdom has no MediaStream; the srcObject stamp is enough — detect()
    // only reads the stamped videoWidth/videoHeight/readyState.
    video.srcObject = null;
    const frame = await det.detect(video);
    expect(frame).not.toBeNull();
    // The ingest sanity window demands a plausible epoch — anything before
    // 2020 means someone reintroduced performance.now() as the capture clock.
    expect(new Date(frame!.capturedAt).getFullYear()).toBeGreaterThanOrEqual(2020);
    expect(frame!.frameWidth).toBe(640);
    expect(frame!.frameHeight).toBe(480);
    expect(frame!.detections).toEqual([]);
    await det.release();
  });
});
