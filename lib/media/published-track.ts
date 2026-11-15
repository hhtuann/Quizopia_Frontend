"use client";

/**
 * Published-camera-track hand-off for the P4-C AI slice (companion to
 * ./active-room.ts). `useAttemptCamera`/`useCameraPreflight` register the
 * track they PUBLISH (raw getUserMedia or the P4-B canvas re-encode
 * fallback); `useAttemptAiDetection` binds its hidden feeder <video> to it
 * without owning or re-acquiring the camera.
 *
 * The getter is liveness-checked: a track stopped by its owner (room
 * disconnect stops local tracks) reads as null, so no explicit clear is
 * needed on every teardown path.
 */

let publishedTrack: MediaStreamTrack | null = null;

/** Register the track that is currently published (publish sites only). */
export function setPublishedCameraTrack(track: MediaStreamTrack | null): void {
  publishedTrack = track;
}

/** The currently published camera track, or null when none is live. */
export function getPublishedCameraTrack(): MediaStreamTrack | null {
  const track = publishedTrack;
  if (track && track.readyState === "live") return track;
  publishedTrack = null; // dead — self-clean
  return null;
}
