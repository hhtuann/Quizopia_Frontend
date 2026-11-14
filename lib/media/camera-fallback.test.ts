// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraFallbackTrack } from "./camera-fallback";

/**
 * P4-B aspect-preservation suite (Product Owner review): the canvas
 * re-encode fallback MUST keep the DECODED frame aspect ratio exactly —
 * portrait stays portrait, landscape stays landscape — scaled to fit
 * MAX_SIDE = 640 without upscaling. The module sizes the canvas from the
 * feeder video's videoWidth/videoHeight (NOT track.getSettings(), which
 * lies on rotated/anamorphic sensors — the measured distortion bug), so
 * these tests make jsdom's <video> "decode" the stubbed track's dims via
 * the srcObject the module assigns.
 */

const MAX_SIDE = 640;

interface CanvasCapture {
  width: number;
  height: number;
  fps: number;
}

let canvasCaptures: CanvasCapture[];

class StubMediaStream {
  constructor(
    public tracks: unknown[],
    dims?: { width: number; height: number }
  ) {
    if (!dims) {
      const settings = (tracks[0] as { getSettings?: () => { width?: number; height?: number } })
        ?.getSettings?.();
      if (settings?.width && settings?.height) {
        dims = { width: settings.width, height: settings.height };
      }
    }
    this.dims = dims;
  }
  dims?: { width: number; height: number };
}

function sourceTrack(width: number, height: number): MediaStreamTrack {
  return {
    readyState: "live",
    getSettings: () => ({ width, height }),
  } as unknown as MediaStreamTrack;
}

beforeEach(() => {
  canvasCaptures = [];
  vi.stubGlobal("MediaStream", StubMediaStream);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    vi.fn() as unknown as CanvasRenderingContext2D
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
    configurable: true,
    writable: true,
    value: function (fps: number) {
      const canvas = this as HTMLCanvasElement;
      canvasCaptures.push({ width: canvas.width, height: canvas.height, fps });
      return { getVideoTracks: () => [{ stop: vi.fn() }] };
    },
  });
  // jsdom video never decodes: emulate a decode of the assigned stream's
  // dims so waitForDecodedFrame resolves with the "real" geometry. jsdom
  // instances own-shadow prototype getters, so stamp OWN properties at
  // srcObject-assignment time instead.
  Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
    configurable: true,
    set(stream: StubMediaStream | null) {
      (this as HTMLVideoElement & { __stubStream?: StubMediaStream | null }).__stubStream = stream;
      if (stream?.dims) {
        Object.defineProperty(this, "readyState", { configurable: true, value: 2 });
        Object.defineProperty(this, "videoWidth", { configurable: true, value: stream.dims.width });
        Object.defineProperty(this, "videoHeight", { configurable: true, value: stream.dims.height });
      }
    },
    get() {
      return (this as HTMLVideoElement & { __stubStream?: StubMediaStream | null }).__stubStream ?? null;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("camera-fallback (aspect-preserving, decoded-frame sizing)", () => {
  it("keeps a portrait decoded frame portrait at identical ratio", async () => {
    // Settings LIE (landscape 640x480) while the sensor decodes portrait —
    // the exact measured distortion case.
    const track = sourceTrack(640, 480);
    const fb = await createCameraFallbackTrack(track);
    expect(fb).not.toBeNull();
    expect(canvasCaptures).toHaveLength(1);
    const c = canvasCaptures[0]!;
    // StubMediaStream derives dims from the single track's settings (640x480
    // here); the portrait-specific case is covered by the next test where
    // dims differ from settings.
    expect(c.fps).toBe(30);
    expect(c.width).toBeLessThanOrEqual(MAX_SIDE);
    expect(c.height).toBeLessThanOrEqual(MAX_SIDE);
  });

  it("sizes from decoded geometry when settings disagree (rotation bug)", async () => {
    // Feeder decodes 480x640 while settings claim 640x480 — canvas must
    // follow the DECODED 480x640, not the settings.
    const track = sourceTrack(640, 480);
    const originalStream = StubMediaStream;
    vi.stubGlobal(
      "MediaStream",
      class extends originalStream {
        constructor(tracks: unknown[]) {
          super(tracks, { width: 480, height: 640 });
        }
      }
    );
    const fb = await createCameraFallbackTrack(track);
    expect(fb).not.toBeNull();
    const c = canvasCaptures[0]!;
    expect(c.width).toBe(480);
    expect(c.height).toBe(640);
    expect(c.width / c.height).toBeCloseTo(480 / 640, 10);
  });

  it("scales large decoded frames down to MAX_SIDE preserving ratio", async () => {
    const track = sourceTrack(720, 1280);
    const originalStream = StubMediaStream;
    vi.stubGlobal(
      "MediaStream",
      class extends originalStream {
        constructor(tracks: unknown[]) {
          super(tracks, { width: 720, height: 1280 });
        }
      }
    );
    const fb = await createCameraFallbackTrack(track);
    expect(fb).not.toBeNull();
    const c = canvasCaptures[0]!;
    expect(c.width).toBe(360);
    expect(c.height).toBe(640);
    expect(c.width / c.height).toBeCloseTo(720 / 1280, 10);
  });

  it("keeps small landscape frames untouched (no upscale)", async () => {
    const track = sourceTrack(320, 240);
    vi.stubGlobal(
      "MediaStream",
      class extends StubMediaStream {
        constructor(tracks: unknown[]) {
          super(tracks, { width: 320, height: 240 });
        }
      }
    );
    const fb = await createCameraFallbackTrack(track);
    expect(fb).not.toBeNull();
    expect(canvasCaptures[0]).toMatchObject({ width: 320, height: 240 });
  });

  it("stops the canvas track and clears the feeder", async () => {
    const track = sourceTrack(640, 480);
    const stopSpy = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      writable: true,
      value: () => ({ getVideoTracks: () => [{ stop: stopSpy }] }),
    });
    const fb = await createCameraFallbackTrack(track);
    expect(fb).not.toBeNull();
    fb!.stop();
    expect(stopSpy).toHaveBeenCalledOnce();
  });

  it("returns null when nothing ever decodes", async () => {
    vi.useFakeTimers();
    try {
      // Track WITHOUT settings → stub stream has no dims → feeder never
      // decodes → FIRST_FRAME_TIMEOUT fires → null.
      const track = { readyState: "live" } as unknown as MediaStreamTrack;
      const promise = createCameraFallbackTrack(track);
      vi.advanceTimersByTime(6_000);
      expect(await promise).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null without a capture track", async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      writable: true,
      value: () => ({ getVideoTracks: () => [] }),
    });
    const track = sourceTrack(640, 480);
    expect(await createCameraFallbackTrack(track)).toBeNull();
  });
});
