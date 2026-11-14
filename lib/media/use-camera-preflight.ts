"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedApiError } from "@/lib/api";
import {
  createCameraPreflight,
  verifyCameraPreflight,
  type PreflightResponse,
} from "@/lib/api/media";
import { isTransferredPublisherRoom } from "./active-room";
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
 *   idle → permission → preview → connecting → verifying → ready
 *   any step ⤳ denied | unavailable | infra | timeout | error
 *
 * - permission: `getUserMedia({video:{640×480}, audio:false})`
 *   (NotAllowedError → denied, NotFoundError-family → unavailable)
 * - preview: the SAME MediaStreamTrack is attached to `previewRef` and later
 *   published — never re-acquired between preview and publish.
 * - connecting: createCameraPreflight → Room.connect(autoSubscribe:false) →
 *   publishTrack(camera).
 * - verifying: poll verifyCameraPreflight every 2s, max 10 tries;
 *   NOT_PUBLISHED keeps polling, READY stores the lease and KEEPS the room
 *   connected (no disconnect — the attempt page takes it over).
 * - retry() tears everything down and re-runs from permission.
 * - unmount: disconnect the room (unless handed off) + stop the track.
 */

export type CameraPreflightStatus =
  | "idle"
  | "permission"
  | "preview"
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
  const roomRef = useRef<Room | null>(null);
  /** Bumped by teardown — in-flight async steps compare their snapshot. */
  const runRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = useCallback((next: CameraPreflightStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Cancel any in-flight run and release room/track. Never touches `status`. */
  const teardown = useCallback(() => {
    runRef.current += 1;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const room = roomRef.current;
    if (room && !isTransferredPublisherRoom(room)) {
      void disconnectRoom(room).catch(() => undefined);
    }
    roomRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
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

  /** Full run: permission → preview → connecting → verifying → ready. */
  const beginRun = useCallback(() => {
    teardown();
    setLease(null);
    setVerifyState(null);
    setLastError(null);
    enter("permission");
    const run = runRef.current;
    const sid = sessionId;

    const poll = (attemptNo: number, preflightId: string): void => {
      pollTimerRef.current = setTimeout(() => {
        void verifyCameraPreflight(sid, preflightId)
          .then((res) => {
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
            if (attemptNo >= VERIFY_MAX_TRIES) {
              fail({ status: "timeout", message: TIMEOUT_COPY });
              return;
            }
            poll(attemptNo + 1, preflightId);
          })
          .catch((err: unknown) => {
            if (run !== runRef.current) return;
            fail(classifyApiError(err));
          });
      }, VERIFY_INTERVAL_MS);
    };

    void navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((stream: MediaStream) => {
        // Video-only request — the first video track IS the camera track.
        const track = stream.getVideoTracks()[0];
        if (!track) {
          fail({ status: "unavailable", message: "No usable camera was found." });
          return;
        }
        if (run !== runRef.current) {
          track.stop();
          return;
        }
        trackRef.current = track;
        setHasTrack(true);
        enter("preview");
        enter("connecting");
        return createCameraPreflight(sid)
          .then(async (preflight: PreflightResponse) => {
            if (run !== runRef.current) return;
            const room = await connectPublisherRoom(preflight.wsUrl, preflight.mediaToken);
            if (run !== runRef.current) {
              void disconnectRoom(room).catch(() => undefined);
              return;
            }
            roomRef.current = room;
            await publishCameraTrack(room, track);
            if (run !== runRef.current) return;
            enter("verifying");
            poll(1, preflight.preflightId);
          })
          .catch((err: unknown) => {
            if (run !== runRef.current) return;
            fail(classifyApiError(err));
          });
      })
      .catch((err: unknown) => {
        if (run !== runRef.current) return;
        fail(classifyCaptureError(err));
      });
  }, [sessionId, teardown, fail, enter]);

  const start = useCallback(() => {
    const s = statusRef.current;
    const inFlight =
      s === "permission" || s === "preview" || s === "connecting" || s === "verifying" || s === "ready";
    if (inFlight) return;
    beginRun();
  }, [beginRun]);

  const retry = useCallback(() => {
    const s = statusRef.current;
    if (s === "permission" || s === "preview" || s === "connecting") return;
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
