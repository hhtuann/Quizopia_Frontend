"use client";

/**
 * Canvas re-encode fallback for rotated/mobile camera sensors (P4-B, e2e
 * finding): some physical webcams (e.g. BisonCam on Docker Desktop) deliver
 * portrait frames (720x1280) that NEVER publish server-side — the server
 * assigns an SID but the track stays empty and no track_published webhook
 * fires. Re-encoding the SAME live track through a landscape canvas
 * publishes perfectly, while synthetic/normal landscape cameras work
 * directly. The preflight hook only engages this after the direct publish
 * repeatedly reads NOT_PUBLISHED (see use-camera-preflight.ts).
 */

const FALLBACK_FPS = 30;
/** Floor dims when track settings are unavailable (jsdom, exotic devices). */
const FALLBACK_MIN_DIM = 480;

export interface CameraFallbackTrack {
  /** The landscape canvas capture track — publish this. */
  track: MediaStreamTrack;
  /** Stops the rAF loop, the canvas track and the hidden feeder <video>. */
  stop: () => void;
}

/**
 * Re-encode a live camera track into a LANDSCAPE canvas capture stream.
 * Output is always landscape: out-w = max(trackW, trackH), out-h = min —
 * a 720x1280 portrait sensor becomes 1280x720. Returns null when the
 * environment has no canvas/captureStream or produced no video track.
 */
export function createCameraFallbackTrack(
  source: MediaStreamTrack
): CameraFallbackTrack | null {
  if (typeof document === "undefined") return null;
  const settings = source.getSettings?.();
  const trackW = settings?.width || FALLBACK_MIN_DIM * (4 / 3);
  const trackH = settings?.height || FALLBACK_MIN_DIM;
  const outW = Math.round(Math.max(trackW, trackH));
  const outH = Math.round(Math.min(trackW, trackH));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Hidden feeder video: browsers only decode camera frames into a
  // drawable surface via a media element.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([source]);

  let rafId = 0;
  let stopped = false;
  const draw = (): void => {
    if (stopped) return;
    // HAVE_CURRENT_DATA (2) — never draw a frame that isn't decoded yet.
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, outW, outH);
    rafId = requestAnimationFrame(draw);
  };
  const play = video.play();
  if (play && typeof play.catch === "function") play.catch(() => undefined);
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
