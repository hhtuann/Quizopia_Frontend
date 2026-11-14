"use client";

import { Room, Track, VideoPresets } from "livekit-client";
import type {
  LocalTrackPublication,
  RoomConnectOptions,
  RoomOptions,
  TrackPublishOptions,
} from "livekit-client";

/**
 * P4-B thin LiveKit helpers (issues #84–#87). NO business logic — every
 * orchestration decision (states, retries, polling) lives in the hooks.
 *
 * Centralizing the `livekit-client` surface here means tests and e2e only
 * ever mock one seam: `vi.mock("livekit-client")` covers every helper.
 *
 * Publisher profile (ADR-08): camera-only publish, NEVER subscribe
 * (`autoSubscribe: false`), simulcast on with an h360 primary layer so the
 * teacher grid can pull a low layer per tile.
 */

/** Primary camera encoding layer (360p is plenty for proctor tiles). */
export const CAMERA_VIDEO_ENCODING = VideoPresets.h360.encoding;

/** Publish options for the student camera track (source pinned to camera). */
export const CAMERA_PUBLISH_OPTIONS: TrackPublishOptions = {
  source: Track.Source.Camera,
  videoEncoding: CAMERA_VIDEO_ENCODING,
  simulcast: true,
};

/** Room options for student publisher rooms (camera simulcast defaults). */
export const PUBLISHER_ROOM_OPTIONS: RoomOptions = {
  publishDefaults: CAMERA_PUBLISH_OPTIONS,
};

/** Connect options for student publisher rooms (never auto-subscribe). */
export const PUBLISHER_CONNECT_OPTIONS: RoomConnectOptions = {
  autoSubscribe: false,
};

/** Camera-only capture request shared by preflight + attempt (no audio). */
export const CAMERA_CAPTURE_REQUEST: MediaStreamConstraints = {
  video: { width: 640, height: 480 },
  audio: false,
};

/**
 * Create + connect a publisher room. `opts` overrides the connect options
 * (e.g. e2e RTC config); publish options always come from the camera preset.
 */
export async function connectPublisherRoom(
  wsUrl: string,
  token: string,
  opts?: RoomConnectOptions
): Promise<Room> {
  const room = new Room(PUBLISHER_ROOM_OPTIONS);
  await room.connect(wsUrl, token, { ...PUBLISHER_CONNECT_OPTIONS, ...opts });
  return room;
}


/**
 * Attach a camera track to a preview `<video>` element. `null` detaches.
 * Falls back to assigning the bare track where `MediaStream` is unavailable
 * (test environments without WebRTC).
 */
export function attachTrack(el: HTMLVideoElement, track: MediaStreamTrack | null): void {
  if (!track) {
    el.srcObject = null;
    return;
  }
  el.srcObject =
    typeof MediaStream === "function"
      ? new MediaStream([track])
      : (track as unknown as MediaStream);
}

/** Publish the (already live) camera track from the local participant. */
export function publishCameraTrack(
  room: Room,
  track: MediaStreamTrack,
  opts?: { name?: string }
): Promise<LocalTrackPublication> {
  return room.localParticipant.publishTrack(track, {
    ...CAMERA_PUBLISH_OPTIONS,
    name: opts?.name,
  });
}

/** Disconnect a room (stops its local tracks by default). */
export function disconnect(room: Room): Promise<void> {
  return room.disconnect();
}

// Re-export the minimal livekit-client surface used by hooks/components so
// consumer files never import "livekit-client" directly.
export { Room, RoomEvent, Track } from "livekit-client";
export type {
  LocalTrackPublication,
  RoomConnectOptions,
  RoomOptions,
  TrackPublishOptions,
  VideoPreset,
} from "livekit-client";
