"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectionQuality, RemoteVideoTrack } from "livekit-client";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import type { CameraParticipantState } from "@/lib/api/media";

/**
 * P4-B: one camera tile in the teacher grid. Media comes from the teacher
 * viewer room (`useCameraGrid`); name/state/attempt metadata comes from the
 * REST camera-status roster. Tiles without a live track render a
 * placeholder (camera-off + last verified time) — a lost camera NEVER
 * mutates anything else on the page.
 */

const STATE_BADGE: Record<CameraParticipantState, { label: string; tone: string }> = {
  CONNECTED: { label: "Connected", tone: "text-[#10B981]" },
  RECONNECTING: { label: "Reconnecting", tone: "text-[#F59E0B]" },
  IDLE: { label: "Idle", tone: "text-[#94A3B8]" },
  REVOKED: { label: "Revoked", tone: "text-[#EF4444]" },
};

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  excellent: "Excellent",
  good: "Good",
  poor: "Poor",
  lost: "Lost",
  unknown: "—",
};

function formatClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-GB");
}

export function CameraTile({
  identity,
  displayName,
  state,
  attemptId,
  connectedSince,
  lastVerifiedAt,
  track,
  connectionQuality,
  muted = false,
  isFullscreen,
  onFullscreen,
  onExitFullscreen,
  onRevoke,
  revoking = false,
}: {
  /** Opaque per-preflight media identity (LiveKit identity). */
  identity: string;
  displayName: string | null;
  state: CameraParticipantState;
  attemptId: number | null;
  connectedSince: string | null;
  lastVerifiedAt: string | null;
  track: RemoteVideoTrack | null;
  connectionQuality: ConnectionQuality;
  /** Publisher muted the camera (OS-level) — last frame may be frozen. */
  muted?: boolean;
  isFullscreen: boolean;
  onFullscreen: (identity: string) => void;
  onExitFullscreen: () => void;
  /** Called AFTER the teacher confirms the revoke dialog. */
  onRevoke: (identity: string) => void;
  revoking?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  // Attach the subscribed track to the <video> element for its lifetime.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  // Esc / browser chrome exits fullscreen → deselect + demote to LOW layer.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onExitFullscreen();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [onExitFullscreen]);

  const toggleFullscreen = () => {
    if (isFullscreen) {
      // Exit affordance while fullscreen: deselect (demotes to LOW layer)
      // and leave the browser fullscreen element.
      onExitFullscreen();
      if (typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => {});
      }
      return;
    }
    onFullscreen(identity);
    const el = containerRef.current;
    // jsdom/test builds have no Fullscreen API — the hook still selects HIGH.
    if (el && typeof el.requestFullscreen === "function") {
      void el.requestFullscreen().catch(() => {});
    }
  };

  const badge = STATE_BADGE[state];
  const quality = QUALITY_LABEL[connectionQuality] ?? "—";
  const lastVerified = formatClock(lastVerifiedAt);
  const connectedAt = formatClock(connectedSince);
  const placeholderText = lastVerified
    ? `Last verified ${lastVerified}`
    : connectedAt
      ? `Connected ${connectedAt}`
      : "Waiting for camera…";
  const name = displayName ?? identity;

  return (
    <div
      ref={containerRef}
      data-media-identity={identity}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[#E2E8F0] bg-white",
        isFullscreen && "ring-2 ring-[#0052FF]"
      )}
    >
      <div className="relative aspect-video bg-[#0F172A]">
        {track ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#F1F5F9] text-[#94A3B8]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m3 3 18 18" />
            </svg>
            <p className="px-2 text-center text-xs font-medium">{placeholderText}</p>
          </div>
        )}

        {/* Muted publisher: the last frame is frozen — flag it explicitly. */}
        {muted && track && (
          <div
            data-camera-muted="true"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0F172A]/75 text-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-10 w-10 text-white" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m3 3 18 18" />
            </svg>
            <p className="text-xs font-semibold uppercase tracking-wider text-white">
              Camera off (muted)
            </p>
          </div>
        )}

        {/* Top overlay: identity + tile actions. */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <span className="max-w-[60%] truncate rounded-md bg-[#0F172A]/70 px-2 py-1 text-xs font-semibold text-white">
            {name}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label={isFullscreen ? "Exit fullscreen" : `Fullscreen ${name}`}
              title={isFullscreen ? "Exit fullscreen" : `Fullscreen ${name}`}
              onClick={toggleFullscreen}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A]/70 text-white outline-none transition-colors hover:bg-[#0F172A]/90 focus-visible:ring-2 focus-visible:ring-[#4D7CFF]"
            >
              {isFullscreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </button>
            {state !== "REVOKED" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-[#EF4444]/40 px-3 text-[#EF4444] hover:border-[#EF4444]/60 hover:bg-[#EF4444]/10"
                onClick={() => setConfirmingRevoke(true)}
              >
                Revoke
              </Button>
            )}
          </div>
        </div>

        {/* Bottom overlay: connection state + quality + attempt chip. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-[#0F172A]/70 px-2 py-1 text-xs font-semibold",
              badge.tone,
              state === "RECONNECTING" && "animate-pulse"
            )}
            data-camera-state={state}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {badge.label}
          </span>
          <span className="rounded-md bg-[#0F172A]/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
            {quality}
          </span>
          {attemptId != null && (
            <span className="ml-auto rounded-md bg-[#0052FF]/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              Attempt in progress
            </span>
          )}
        </div>
      </div>

      {/* Revoke is destructive for the student's attempt-side camera — confirm first. */}
      <ConfirmDialog
        open={confirmingRevoke}
        titleId={`revoke-camera-${identity}`}
        title="Revoke camera access?"
        description={`This disconnects ${name}'s camera for the rest of the session. Their answers and attempt are not affected.`}
        confirmLabel="Revoke camera"
        cancelLabel="Keep camera"
        busy={revoking}
        busyLabel="Revoking…"
        onConfirm={() => {
          setConfirmingRevoke(false);
          onRevoke(identity);
        }}
        onCancel={() => setConfirmingRevoke(false)}
      />
    </div>
  );
}
