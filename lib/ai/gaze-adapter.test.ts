// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAZE_BINS } from "./gaze-core";

/**
 * Gaze adapter (YOLO11n-face → MobileGaze) against a MOCKED onnxruntime-web
 * — no wasm ever loads in vitest, so this covers the adapter's contract
 * (session wiring, input names/shapes, face → crop → angles, honest
 * failure states), NOT model accuracy.
 */

// vi.mock factories are hoisted: shared state goes through vi.hoisted.
const ortMock = vi.hoisted(() => ({
  state: {
    creates: [] as string[][],
    runs: [] as { name: string; dims: number[] }[],
    failWebgpu: false,
    failAll: false,
    /** Row-major anchors [cx,cy,w,h,score] the face session returns. */
    faces: [] as number[][],
    yawBin: 45,
    pitchBin: 45,
    active: 0,
    maxActive: 0,
    /** When true, the FACE session's run never settles (wedged runtime). */
    hangFace: false,
    releases: 0,
  },
}));

vi.mock("onnxruntime-web", () => {
  const peak = (bin: number): Float32Array => {
    const logits = new Float32Array(90).fill(-20);
    logits[bin] = 20;
    return logits;
  };
  return {
    InferenceSession: {
      create: async (_bytes: unknown, opts?: { executionProviders?: string[] }) => {
        const eps = opts?.executionProviders ?? [];
        ortMock.state.creates.push(eps);
        if (ortMock.state.failAll) throw new Error("no backend");
        if (ortMock.state.failWebgpu && eps.includes("webgpu")) {
          throw new Error("webgpu init failed");
        }
        return {
          run: async (feeds: Record<string, { dims: number[] }>) => {
            const s = ortMock.state;
            if (s.hangFace && Object.keys(feeds)[0] === "images") {
              return new Promise(() => undefined);
            }
            s.active += 1;
            s.maxActive = Math.max(s.maxActive, s.active);
            await Promise.resolve();
            s.active -= 1;
            const name = Object.keys(feeds)[0];
            s.runs.push({ name, dims: feeds[name].dims });
            if (name === "images") {
              const n = Math.max(1, s.faces.length);
              const data = new Float32Array(5 * n);
              s.faces.forEach((row, i) => row.forEach((v, c) => (data[c * n + i] = v)));
              return { output0: { dims: [1, 5, n], data } };
            }
            return {
              yaw: { dims: [1, 90], data: peak(s.yawBin) },
              pitch: { dims: [1, 90], data: peak(s.pitchBin) },
            };
          },
          release: async () => {
            ortMock.state.releases += 1;
          },
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
  };
});

function videoOf(w: number, h: number): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { configurable: true, value: w });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: h });
  return video;
}

let drawImage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.assign(ortMock.state, {
    creates: [],
    runs: [],
    failWebgpu: false,
    failAll: false,
    faces: [],
    yawBin: 45,
    pitchBin: 45,
    active: 0,
    maxActive: 0,
    hangFace: false,
    releases: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
  );
  drawImage = vi.fn();
  const ctx = {
    fillRect: vi.fn(),
    drawImage,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("gaze capability surface", () => {
  it("is supported via the dedicated face + gaze models", async () => {
    const { GAZE_SUPPORT, GAZE_MODEL } = await import("./gaze-adapter");
    expect(GAZE_SUPPORT.supported).toBe(true);
    expect(GAZE_SUPPORT.models).toEqual(["yolov11n-face", "mobilegaze-mobileone-s0"]);
    // Backend limit: modelId / modelVersion ≤ 40 chars.
    expect(GAZE_MODEL.id.length).toBeLessThanOrEqual(40);
    expect(GAZE_MODEL.version.length).toBeLessThanOrEqual(40);
  });
});

describe("createGazeEstimator (mocked ort)", () => {
  it("loads both models, warms them up with the measured input shapes (wasm in jsdom)", async () => {
    const { createGazeEstimator, FACE_MODEL_URL, GAZE_MODEL_URL } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    expect(est.status).toBe("running");
    expect(est.runtime).toBe("ORT_WEB_WASM"); // jsdom: no navigator.gpu
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual([FACE_MODEL_URL, GAZE_MODEL_URL]);
    expect(ortMock.state.creates).toEqual([["wasm"], ["wasm"]]);
    expect(ortMock.state.runs).toEqual([
      { name: "images", dims: [1, 3, 640, 640] },
      { name: "input", dims: [1, 3, 448, 448] },
    ]);
    await est.release();
    expect(est.status).toBe("released");
  });

  it("face found → crops that face and returns decoded angles + normalized box", async () => {
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    // 640×480 → letterbox scale 1, dy 80. Face centre (320,320) 160×200 in
    // letterbox px = source box (240,140)-(400,340).
    ortMock.state.faces = [[320, 320, 160, 200, 0.92]];
    ortMock.state.yawBin = 52; // +28°
    ortMock.state.pitchBin = 40; // -20°
    const obs = await est.estimate(videoOf(640, 480));
    expect(obs).not.toBeNull();
    expect(obs!.faceCount).toBe(1);
    expect(obs!.faceWidthPx).toBeCloseTo(160);
    expect(obs!.faceScore).toBeCloseTo(0.92);
    expect(obs!.faceBox![0]).toBeCloseTo(240 / 640);
    expect(obs!.faceBox![1]).toBeCloseTo(140 / 480);
    expect(obs!.faceBox![2]).toBeCloseTo(400 / 640);
    expect(obs!.faceBox![3]).toBeCloseTo(340 / 480);
    expect(obs!.yaw).toBeCloseTo(28);
    expect(obs!.pitch).toBeCloseTo(-20);
    expect(obs!.runtime).toBe("ORT_WEB_WASM");
    expect(obs!.processingMs).toBeGreaterThanOrEqual(0);
    // The gaze crop is that exact source rectangle, stretched to 448².
    const crop = drawImage.mock.calls[drawImage.mock.calls.length - 1];
    expect(crop.slice(1)).toEqual([240, 140, 160, 200, 0, 0, 448, 448]);
    await est.release();
  });

  it("no face → an honest empty reading, and the gaze model is not run", async () => {
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    const before = ortMock.state.runs.length;
    const obs = await est.estimate(videoOf(640, 480));
    expect(obs).toEqual(
      expect.objectContaining({ faceCount: 0, faceBox: null, faceScore: null, yaw: null, pitch: null })
    );
    expect(ortMock.state.runs.slice(before).map((r) => r.name)).toEqual(["images"]);
    await est.release();
  });

  it("several faces → counts them all, gaze only for the largest", async () => {
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    ortMock.state.faces = [
      [120, 200, 60, 80, 0.95], // small, higher score
      [400, 320, 200, 240, 0.7], // largest → the test taker
    ];
    const obs = await est.estimate(videoOf(640, 480));
    expect(obs!.faceCount).toBe(2);
    expect(obs!.faceWidthPx).toBeCloseTo(200);
    expect(obs!.faceScore).toBeCloseTo(0.7);
    await est.release();
  });

  it("no decoded frame yet → null (never a fake reading)", async () => {
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    expect(await est.estimate(videoOf(0, 0))).toBeNull();
    await est.release();
    expect(await est.estimate(videoOf(640, 480))).toBeNull(); // released
  });

  it("WebGPU session failure falls back to wasm", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    ortMock.state.failWebgpu = true;
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    expect(est.status).toBe("running");
    expect(est.runtime).toBe("ORT_WEB_WASM");
    expect(ortMock.state.creates[0]).toEqual(["webgpu", "wasm"]);
    expect(ortMock.state.creates[ortMock.state.creates.length - 1]).toEqual(["wasm"]);
    await est.release();
  });

  it("WebGPU available → both sessions on webgpu with the wasm fallback EP", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    expect(est.runtime).toBe("ORT_WEB_WEBGPU");
    expect(ortMock.state.creates).toEqual([
      ["webgpu", "wasm"],
      ["webgpu", "wasm"],
    ]);
    await est.release();
  });

  it("every backend failing → 'unavailable', estimate() stays null", async () => {
    ortMock.state.failAll = true;
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    expect(est.status).toBe("unavailable");
    expect(est.runtime).toBeNull();
    expect(await est.estimate(videoOf(640, 480))).toBeNull();
  });

  it("model fetch failure → 'unavailable'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    expect(est.status).toBe("unavailable");
    expect(ortMock.state.creates).toEqual([]);
  });

  it("session runs never overlap, even with concurrent estimates (shared ORT queue)", async () => {
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    ortMock.state.faces = [[320, 320, 160, 200, 0.9]];
    await Promise.all([
      est.estimate(videoOf(640, 480)),
      est.estimate(videoOf(640, 480)),
      est.estimate(videoOf(640, 480)),
    ]);
    expect(ortMock.state.maxActive).toBe(1);
    await est.release();
  });

  it("a WEDGED gaze run never stalls yolo26s: lease expires, gaze retires, the queue moves on", async () => {
    const { createGazeEstimator, GAZE_RUN_LEASE_MS } = await import("./gaze-adapter");
    // Same module instance the adapter uses — the REAL shared queue.
    const { runOrtExclusive } = await import("./model-adapter");
    const est = await createGazeEstimator();
    expect(est.status).toBe("running");
    vi.useFakeTimers();
    try {
      ortMock.state.hangFace = true;
      const pending = est.estimate(videoOf(640, 480)); // never settles
      // A yolo26s frame queued behind the wedged gaze run.
      const yolo = runOrtExclusive(async () => "yolo26s frame");
      let yoloDone = false;
      void yolo.then(() => (yoloDone = true));
      await vi.advanceTimersByTimeAsync(GAZE_RUN_LEASE_MS - 100);
      expect(yoloDone).toBe(false); // still inside the lease
      await vi.advanceTimersByTimeAsync(200);
      expect(await yolo).toBe("yolo26s frame");
      expect(est.status).toBe("unavailable");
      // Retired: no further session calls, and release never touches the
      // sessions the runtime may still be inside.
      expect(await est.estimate(videoOf(640, 480))).toBeNull();
      await est.release();
      expect(ortMock.state.releases).toBe(0);
      void pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it("a healthy estimator releases its sessions through the shared queue", async () => {
    const { createGazeEstimator } = await import("./gaze-adapter");
    const est = await createGazeEstimator();
    await est.release();
    expect(ortMock.state.releases).toBe(2);
  });

  it("the gaze head has the 90 bins the decoder assumes", () => {
    expect(GAZE_BINS).toBe(90);
  });
});
