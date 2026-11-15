"use client";

/**
 * Canvas re-encode fallback for exotic camera pipelines (P4-B, e2e
 * finding): some physical webcams deliver tracks that never publish
 * server-side directly (rotated/anamorphic sensors — LiveKit assigns an
 * SID but the track stays empty). Re-encoding the SAME live track through
 * a canvas publishes reliably.
 *
 * The canvas is sized from the feeder's ACTUAL DECODED frame geometry
 * (`videoWidth/videoHeight` after the first frame), never from
 * `track.getSettings()`: rotated/anamorphic sensors are exactly the ones
 * whose reported settings disagree with the frames they deliver, and
 * sizing from settings stretches the picture (measured: a sensor
 * reporting 640x480 while delivering portrait frames). Output keeps the
 * decoded aspect ratio exactly, scaled to fit MAX_SIDE, never upscaled.
 * No rotation is attempted — browsers expose no reliable
 * "sensor mounted rotated" metadata, and the preview shows the same
 * orientation we publish.
 *
 * Returns null when no frame decodes within FIRST_FRAME_TIMEOUT_MS or the
 * environment cannot produce a capture track.
 */

const FALLBACK_FPS = 30;
/** Longest canvas side (no upscaling; proctor tiles need no more). */
const MAX_SIDE = 640;
/** How long to wait for the feeder's first decoded frame. */
const FIRST_FRAME_TIMEOUT_MS = 5_000;

export interface CameraFallbackTrack {
  /** The canvas capture track — publish this. */
  track: MediaStreamTrack;
  /** Stops the rAF loop, the canvas track and the hidden feeder <video>. */
  stop: () => void;
}

function waitForDecodedFrame(
  video: HTMLVideoElement
): Promise<{ w: number; h: number } | null> {
  if (video.readyState >= 2 && video.videoWidth > 0) {
    return Promise.resolve({ w: video.videoWidth, h: video.videoHeight });
  }
  const { promise, resolve } = Promise.withResolvers<{ w: number; h: number } | null>();
  const timer = setTimeout(() => resolve(null), FIRST_FRAME_TIMEOUT_MS);
  const onReady = (): void => {
    if (video.videoWidth > 0) {
      clearTimeout(timer);
      resolve({ w: video.videoWidth, h: video.videoHeight });
    }
  };
  video.addEventListener("loadeddata", onReady);
  video.addEventListener("canplay", onReady);
  void promise.then(() => {
    video.removeEventListener("loadeddata", onReady);
    video.removeEventListener("canplay", onReady);
  });
  return promise;
}

/**
 * Re-encode a live camera track into an aspect-true canvas capture
 * stream. Async: resolves after the feeder's first decoded frame sizes
 * the canvas.
 */
export async function createCameraFallbackTrack(
  source: MediaStreamTrack
): Promise<CameraFallbackTrack | null> {
  if (typeof document === "undefined") return null;

  // Hidden feeder video: browsers only decode camera frames into a
  // drawable surface via a media element.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([source]);
  const play = video.play();
  if (play && typeof play.catch === "function") play.catch(() => undefined);

  const decoded = await waitForDecodedFrame(video);
  if (!decoded) {
    video.srcObject = null;
    return null;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(decoded.w, decoded.h));
  const outW = Math.max(1, Math.round(decoded.w * scale));
  const outH = Math.max(1, Math.round(decoded.h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    video.srcObject = null;
    return null;
  }

  let rafId = 0;
  let stopped = false;
  const draw = (): void => {
    if (stopped) return;
    // Environments without a real 2D context (jsdom, hardened browsers
    // with canvas disabled) cannot draw — stop the loop instead of
    // throwing every frame.
    if (typeof ctx.drawImage !== "function") {
      stopped = true;
      return;
    }
    // HAVE_CURRENT_DATA (2) — never draw a frame that isn't decoded yet.
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, outW, outH);
    rafId = requestAnimationFrame(draw);
  };
  rafId = requestAnimationFrame(draw);

  const capture = canvas.captureStream(FALLBACK_FPS);
  const track = capture.getVideoTracks()[0];
  if (!track) {
    stopped = true;
    cancelAnimationFrame(rafId);
    video.srcObject = null;
    return null;
  }
  return {
    track,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      track.stop();
      video.srcObject = null;
    },
  };
}
