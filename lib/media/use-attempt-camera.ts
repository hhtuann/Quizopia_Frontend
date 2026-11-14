"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedApiError } from "@/lib/api";
import { renewAttemptMediaToken } from "@/lib/api/media";
import { setActivePublisherRoom, takeActivePublisherRoom } from "./active-room";
import { registerMediaRoom } from "./test-hooks";
import {
  connectPublisherRoom,
  disconnect as disconnectRoom,
  publishCameraTrack,
  RoomEvent,
  type Room,
} from "./livekit";

/**
 * Maintain the student's camera publish during an IN_PROGRESS attempt
 * (P4-B, plan §6). Camera loss NEVER blocks answering — the hook only
 * reports a status for the header pill and silently repairs the stream.
 *
 *   mount → adopt the landing page's connected room when present (no double
 *           connect), else renewAttemptMediaToken → connect → publish
 *             409 NOT_APPLICABLE → inactive (unmonitored attempt; pill hidden)
 *             409 BINDING_MISSING → unbound (informational; answers saved)
 *             403 REVOKED        → revoked (terminal, no retry)
 *   RoomEvent.Disconnected → reconnecting + backoff retries (1s,2s,4s…
 *           capped at 15s, forever while the attempt is mounted); every
 *           retry re-POSTs renewAttemptMediaToken for a fresh token.
 *   reconnect success → verified (the server emits CAMERA_RECONNECTED; the
 *           client never fakes timeline events).
 *   unmount → disconnect + stop track + clear the test-hook registry.
 */

export type AttemptCameraStatus =
  | "inactive"
  | "unbound"
  | "connecting"
  | "verified"
  | "reconnecting"
  | "revoked";

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

/**
 * Grace window before an ADOPTED room's deferred disconnect (cleanup hands
 * it back first): a React StrictMode remount re-adopts within it, so the
 * camera never drops at the start of a monitored attempt.
 */
const ADOPT_DISCONNECT_GRACE_MS = 100;

/** Terminal outcomes derived from a renewal API error, or null (transient). */
function classifyRenewalError(err: unknown): AttemptCameraStatus | null {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind !== "api") return null;
  if (norm.code === "MONITORING_CAMERA_REVOKED") return "revoked";
  if (norm.code === "MONITORING_PREFLIGHT_NOT_APPLICABLE") return "inactive";
  if (norm.code === "MONITORING_BINDING_MISSING") return "unbound";
  return null;
}

export interface AttemptCameraState {
  status: AttemptCameraStatus;
}

export function useAttemptCamera(attemptId: number): AttemptCameraState {
  const [status, setStatus] = useState<AttemptCameraStatus>("connecting");

  const statusRef = useRef<AttemptCameraStatus>("connecting");
  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(false);
  const retryCountRef = useRef(0);
  /** StrictMode grace timer for an adopted room pending deferred disconnect. */
  const pendingAdoptTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    const id = attemptId;

    const enter = (next: AttemptCameraStatus) => {
      statusRef.current = next;
      setStatus(next);
    };

    const forgetRoom = (room: Room): void => {
      room.removeAllListeners(RoomEvent.Disconnected);
      void disconnectRoom(room).catch(() => undefined);
    };

    /** Reuse the live track across retries; reacquire only when ended. */
    const acquireTrack = async (): Promise<MediaStreamTrack> => {
      const existing = trackRef.current;
      if (existing && existing.readyState === "live") return existing;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      // Video-only request — the first video track IS the camera track.
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("no camera track");
      trackRef.current = track;
      return track;
    };

    const scheduleRetry = (): void => {
      if (!mountedRef.current) return;
      const delay = Math.min(RETRY_BASE_MS * 2 ** retryCountRef.current, RETRY_MAX_MS);
      retryCountRef.current += 1;
      timerRef.current = setTimeout(() => void connect(), delay);
    };

    const onDisconnected = (room: Room): void => {
      // Ignore intentional teardowns and events from rooms we already replaced.
      if (!mountedRef.current || roomRef.current !== room) return;
      if (statusRef.current === "revoked" || statusRef.current === "inactive") return;
      enter("reconnecting");
      scheduleRetry();
    };

    const connect = async (): Promise<void> => {
      try {
        const res = await renewAttemptMediaToken(id);
        if (!mountedRef.current) return;
        const track = await acquireTrack();
        if (!mountedRef.current) {
          track.stop();
          return;
        }
        const room = await connectPublisherRoom(res.wsUrl, res.mediaToken);
        if (!mountedRef.current) {
          void disconnectRoom(room).catch(() => undefined);
          track.stop();
          return;
        }
        await publishCameraTrack(room, track);
        if (!mountedRef.current) {
          void disconnectRoom(room).catch(() => undefined);
          return;
        }
        // Adopt the new room (the old one, if any, is already dead).
        if (roomRef.current && roomRef.current !== room) {
          forgetRoom(roomRef.current);
        }
        roomRef.current = room;
        room.on(RoomEvent.Disconnected, () => onDisconnected(room));
        registerMediaRoom("attempt", room);
        retryCountRef.current = 0;
        enter("verified");
      } catch (err) {
        if (!mountedRef.current) return;
        const terminal = classifyRenewalError(err);
        if (terminal) {
          clearTimeout(timerRef.current);
          if (roomRef.current) {
            forgetRoom(roomRef.current);
            roomRef.current = null;
          }
          registerMediaRoom("attempt", null);
          enter(terminal);
          return;
        }
        // Transient (network, getUserMedia, connect) — keep trying quietly.
        enter("reconnecting");
        scheduleRetry();
      }
    };

    let adoptedRoom: Room | null = null;

    const begin = (): void => {
      // Landing hand-off: adopt the already-connected publisher room so we
      // never double-publish; a stale one falls through to renewal.
      const adopted = takeActivePublisherRoom();
      if (adopted) {
        // StrictMode/quick-remount: re-adopting cancels the deferred
        // disconnect a previous cleanup scheduled for this room.
        clearTimeout(pendingAdoptTimerRef.current);
        pendingAdoptTimerRef.current = undefined;
        adoptedRoom = adopted;
        roomRef.current = adopted;
        adopted.on(RoomEvent.Disconnected, () => onDisconnected(adopted));
        registerMediaRoom("attempt", adopted);
        if (adopted.state === "connected") {
          retryCountRef.current = 0;
          enter("verified");
          return;
        }
        adoptedRoom = null;
        roomRef.current = null;
        registerMediaRoom("attempt", null);
        forgetRoom(adopted);
      }
      void connect();
    };

    begin();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      retryCountRef.current = 0;
      const room = roomRef.current;
      roomRef.current = null;
      const track = trackRef.current;
      trackRef.current = null;
      registerMediaRoom("attempt", null);
      if (!room) return;
      // StrictMode grace (P4-B): an ADOPTED room that is still connected
      // and publishing the landing's track is handed BACK and disconnected
      // only after a grace window — a StrictMode remount re-adopts it (see
      // begin) so the camera never drops; a real unmount disconnects late.
      // Rooms this hook connected itself (renewal/reconnect path) and dead
      // adopted rooms disconnect immediately.
      if (room === adoptedRoom && room.state === "connected" && track === null) {
        setActivePublisherRoom(room);
        clearTimeout(pendingAdoptTimerRef.current);
        pendingAdoptTimerRef.current = setTimeout(() => {
          pendingAdoptTimerRef.current = undefined;
          const stillPending = takeActivePublisherRoom();
          if (stillPending !== room) {
            // Re-adopted by a later mount — leave it connected.
            if (stillPending) setActivePublisherRoom(stillPending);
            return;
          }
          forgetRoom(room);
        }, ADOPT_DISCONNECT_GRACE_MS);
        return;
      }
      track?.stop();
      forgetRoom(room);
    };
  }, [attemptId]);

  return { status };
}
