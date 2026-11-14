"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedApiError } from "@/lib/api";
import {
  createCameraPreflight,
  verifyCameraPreflight,
  type PreflightResponse,
} from "@/lib/api/media";
import { isTransferredPublisherRoom } from "./active-room";
import { registerMediaRoom } from "./test-hooks";
import { createCameraFallbackTrack } from "./camera-fallback";
import {
  attachTrack,
  connectPublisherRoom,
  disconnect as disconnectRoom,
  publishCameraTrack,
  type Room,
} from "./livekit";

/**
 * Student camera preflight state machine for the session landing page
 * (P4-B, plan §6): a fresh camera check must reach READY before a monitored
 * session's Start unlocks, and the connected publisher Room + camera track
 * survive until the attempt page adopts them (see ./active-room.ts).
 *
 *   idle → connecting → permission → verifying → ready
 *   any step ⤳ denied | unavailable | infra | timeout | error
 *
 * - connecting: createCameraPreflight → Room.connect(autoSubscribe:false).
 *   The room MUST be connected BEFORE real capture starts: running
 *   getUserMedia during the connect/publish handshake destabilizes the
 *   publisher transport on some real devices (DATA_TRACK_LOSSY close,
 *   server sees the participant with zero published tracks). Synthetic
 *   (fake-device) cameras hide it; real webcams do not (e2e, BisonCam).
 * - permission: `getUserMedia({video:{640×480}, audio:false})` fires the
 *   browser prompt (NotAllowedError → denied, NotFoundError-family →
 *   unavailable); the granted MediaStreamTrack is attached to `previewRef`
 *   for local preview and then published — the SAME track, never
 *   re-acquired between preview and publish.
 * - verifying: poll verifyCameraPreflight every 2s, max 10 tries;
 *   NOT_PUBLISHED keeps polling, READY stores the lease and KEEPS the room
 *   connected (no disconnect — the attempt page takes it over).
 *   Rotated-sensor fallback: after 3 consecutive NOT_PUBLISHED polls the
 *   live camera track is re-encoded through an aspect-preserving canvas
 *   (./camera-fallback.ts) and THAT track is published (name
 *   "camera-fallback") — same room, same preflight, run not restarted. If
 *   the fallback also stays NOT_PUBLISHED through the poll budget →
 *   timeout (truthful).
 * - retry() tears everything down and re-runs from connecting.
 * - unmount: disconnect the room (unless handed off) + stop BOTH the camera
 *   track and any canvas fallback track.
 */

export type CameraPreflightStatus =
  | "idle"
  | "permission"
  | "connecting"
  | "verifying"
  | "ready"
  | "denied"
  | "unavailable"
  | "infra"
  | "timeout"
  | "error";

/** Terminal, retryable failure causes (mapped from errors below). */
export type CameraPreflightFailure = "denied" | "unavailable" | "infra" | "timeout" | "error";

const VERIFY_INTERVAL_MS = 2_000;
const VERIFY_MAX_TRIES = 10;
/**
 * Consecutive NOT_PUBLISHED polls (≈6s) before switching to the
 * aspect-preserving canvas re-encode fallback for sensors whose raw track
 * never publishes server-side (see ./camera-fallback.ts).
 */
const FALLBACK_AFTER_NOT_PUBLISHED = 3;

const INFRA_COPY = "Camera verification is unavailable right now — please try again in a moment.";
const TIMEOUT_COPY = "We couldn't verify your camera in time. Check that your camera works, then retry.";
const ERROR_COPY = "Something went wrong during the camera check. Please retry.";

/** Classify a getUserMedia failure per the state contract above. */
function classifyCaptureError(err: unknown): { status: CameraPreflightFailure; message: string } {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return { status: "denied", message: "Camera access was denied in your browser." };
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotReadableError" ||
    name === "TrackStartError"
  ) {
    return { status: "unavailable", message: "No usable camera was found." };
  }
  return { status: "error", message: ERROR_COPY };
}

/** Classify an API/connect failure: infra outages vs anything else. */
function classifyApiError(err: unknown): { status: CameraPreflightFailure; message: string } {
  const norm = err as NormalizedApiError | undefined;
  const infra =
    (norm?.kind === "api" && norm.code === "MONITORING_INFRA_UNAVAILABLE") ||
    norm?.kind === "network";
  if (infra) return { status: "infra", message: INFRA_COPY };
  if (norm?.kind === "api" && norm.code === "MONITORING_PREFLIGHT_EXPIRED") {
    return { status: "error", message: "Camera check expired — verify again." };
  }
  return { status: "error", message: norm?.kind === "api" ? norm.message : ERROR_COPY };
}

export interface CameraPreflightLease {
  readinessLease: string;
  readinessExpiresAt: string;
  verifiedCameraTrackSid: string;
}

export interface CameraPreflightState {
  status: CameraPreflightStatus;
  /** Ref for the preview <video> element; the hook attaches the track. */
  previewRef: React.RefObject<HTMLVideoElement | null>;
  /** Lease details once status === "ready" (null otherwise). */
  lease: CameraPreflightLease | null;
  /** Last verify poll result ("NOT_PUBLISHED" | "READY" | null). */
  verifyState: "NOT_PUBLISHED" | "READY" | null;
  /** Human-readable cause once status is a failure state. */
  lastError: string | null;
  /** Echo of the eligibility-derived flag (copy only; monitored ⇒ true today). */
  cameraRequired: boolean;
  /** Begin the check (idle/failure states only; ignored mid-run). */
  start: () => void;
  /** Tear down the current run and begin again from permission. */
  retry: () => void;
  /** Current connected room (for the landing→attempt hand-off). */
  keepAlive: () => Room | null;
}

export function useCameraPreflight({
  sessionId,
  cameraRequired,
}: {
  sessionId: number;
  cameraRequired: boolean;
}): CameraPreflightState {
  const [status, setStatus] = useState<CameraPreflightStatus>("idle");
  const [lease, setLease] = useState<CameraPreflightLease | null>(null);
  const [verifyState, setVerifyState] = useState<"NOT_PUBLISHED" | "READY" | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasTrack, setHasTrack] = useState(false);

  // Mirror of `status` for guards inside stable callbacks.
  const statusRef = useRef<CameraPreflightStatus>("idle");
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  /** Canvas re-encode fallback (feeds from trackRef's live camera track). */
  const fallbackRef = useRef<{ track: MediaStreamTrack; stop: () => void } | null>(null);
  const roomRef = useRef<Room | null>(null);
  /** Bumped by teardown — in-flight async steps compare their snapshot. */
  const runRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = useCallback((next: CameraPreflightStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /**
   * Cancel any in-flight run and release room/track/fallback. Never touches
   * `status`. A room handed off to the attempt page keeps the connection,
   * the published camera track AND its canvas fallback alive — ownership
   * moved, we only drop references.
   */
  const teardown = useCallback(() => {
    runRef.current += 1;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const room = roomRef.current;
    const track = trackRef.current;
    const fallback = fallbackRef.current;
    roomRef.current = null;
    trackRef.current = null;
    fallbackRef.current = null;
    if (room && isTransferredPublisherRoom(room)) return;
    registerMediaRoom("preflight", null);
    if (room) void disconnectRoom(room).catch(() => undefined);
    fallback?.stop();
    track?.stop();
    setHasTrack(false);
  }, []);

  const fail = useCallback(
    (result: { status: CameraPreflightFailure; message: string }) => {
      teardown();
      setLease(null);
      setVerifyState(null);
      setLastError(result.message);
      enter(result.status);
    },
    [teardown, enter]
  );

  /**
   * Full run: connecting (server+room) → permission (capture) → verifying →
   * ready. Real capture starts only AFTER the room is connected.
   */
  const beginRun = useCallback(() => {
    teardown();
    setLease(null);
    setVerifyState(null);
    setLastError(null);
    enter("connecting");
    const run = runRef.current;
    const sid = sessionId;
    let notPublishedStreak = 0;
    let fallbackAttempted = false;

    /**
     * Rotated-sensor rescue: unpublish the dead-transport camera track and
     * publish a landscape canvas re-encode of the SAME live track. One shot
     * per run; the server sees the same room/identity, so polling continues
     * untouched. A failed fallback just keeps polling (budget → timeout).
     */
    const tryCanvasFallback = async (): Promise<void> => {
      if (fallbackAttempted) return;
      fallbackAttempted = true;
      const camera = trackRef.current;
      const room = roomRef.current;
      // Only re-encode a still-live camera; an ended track feeds nothing.
      if (!room || !camera || camera.readyState !== "live") return;
      const fallback = await createCameraFallbackTrack(camera);
      if (!fallback) return;
      fallbackRef.current = fallback;
      // Drop the publication that never reached the server. stopOnUnpublish
      // MUST be false — the camera track keeps feeding the canvas.
      await room.localParticipant.unpublishTrack(camera, false).catch(() => undefined);
      if (run !== runRef.current) {
        fallback.stop();
        fallbackRef.current = null;
        return;
      }
      await publishCameraTrack(room, fallback.track, { name: "camera-fallback" }).catch(
        () => undefined
      );
    };

    const poll = (attemptNo: number, preflightId: string): void => {
      pollTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const res = await verifyCameraPreflight(sid, preflightId);
            if (run !== runRef.current) return;
            if (res.state === "READY") {
              setLease({
                readinessLease: res.readinessLease,
                readinessExpiresAt: res.readinessExpiresAt,
                verifiedCameraTrackSid: res.verifiedCameraTrackSid,
              });
              setVerifyState("READY");
              setLastError(null);
              enter("ready");
              pollTimerRef.current = null;
              return;
            }
            setVerifyState("NOT_PUBLISHED");
            notPublishedStreak += 1;
            if (notPublishedStreak === FALLBACK_AFTER_NOT_PUBLISHED) {
              await tryCanvasFallback();
              if (run !== runRef.current) return;
            }
            if (attemptNo >= VERIFY_MAX_TRIES) {
              fail({ status: "timeout", message: TIMEOUT_COPY });
              return;
            }
            poll(attemptNo + 1, preflightId);
          } catch (err) {
            if (run !== runRef.current) return;
            fail(classifyApiError(err));
          }
        })();
      }, VERIFY_INTERVAL_MS);
    };

    void (async () => {
      // 1. Preflight lease (API) — no capture yet.
      let preflight: PreflightResponse;
      try {
        preflight = await createCameraPreflight(sid);
      } catch (err) {
        if (run !== runRef.current) return;
        fail(classifyApiError(err));
        return;
      }
      if (run !== runRef.current) return;

      // 2. Connect the publisher room BEFORE starting real capture.
      let room: Room;
      try {
        room = await connectPublisherRoom(preflight.wsUrl, preflight.mediaToken);
      } catch (err) {
        if (run !== runRef.current) return;
        fail(classifyApiError(err));
        return;
      }
      if (run !== runRef.current) {
        void disconnectRoom(room).catch(() => undefined);
        return;
      }
      roomRef.current = room;
      registerMediaRoom("preflight", room);

      // 3. Real capture starts only now — the room is fully connected, so
      //    the publisher transport is stable when frames begin to flow.
      enter("permission");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
      } catch (err) {
        if (run !== runRef.current) return;
        fail(classifyCaptureError(err));
        return;
      }
      if (run !== runRef.current) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      // Video-only request — the first video track IS the camera track.
      const track = stream.getVideoTracks()[0];
      if (!track) {
        fail({ status: "unavailable", message: "No usable camera was found." });
        return;
      }
      trackRef.current = track;
      setHasTrack(true);

      // 4. Publish the SAME track the preview shows.
      try {
        await publishCameraTrack(room, track);
      } catch (err) {
        if (run !== runRef.current) return;
        fail(classifyApiError(err));
        return;
      }
      if (run !== runRef.current) return;
      enter("verifying");
      poll(1, preflight.preflightId);
    })();
  }, [sessionId, teardown, fail, enter]);

  const start = useCallback(() => {
    const s = statusRef.current;
    const inFlight =
      s === "permission" || s === "connecting" || s === "verifying" || s === "ready";
    if (inFlight) return;
    beginRun();
  }, [beginRun]);

  const retry = useCallback(() => {
    const s = statusRef.current;
    if (s === "permission" || s === "connecting") return;
    beginRun();
  }, [beginRun]);

  // Attach the live track to the preview element whenever it (re)appears or
  // the video element remounts (status transitions re-run this effect).
  useEffect(() => {
    if (!hasTrack) return;
    if (previewRef.current && trackRef.current) {
      attachTrack(previewRef.current, trackRef.current);
    }
  }, [hasTrack, status]);

  // Unmount: cancel polling, disconnect (unless handed off), stop the track.
  useEffect(() => () => teardown(), [teardown]);

  const keepAlive = useCallback(() => roomRef.current, []);

  return {
    status,
    previewRef,
    lease,
    verifyState,
    lastError,
    cameraRequired,
    start,
    retry,
    keepAlive,
  };
}
