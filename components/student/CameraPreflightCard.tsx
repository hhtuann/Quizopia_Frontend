"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  useCameraPreflight,
  type CameraPreflightStatus,
} from "@/lib/media/use-camera-preflight";
import type { Room } from "@/lib/media/livekit";

/**
 * Camera verification card for monitored CAN_START sessions (P4-B). Replaces
 * the P4-A fail-closed block: the student runs a live camera check (room
 * connect → camera access → publish → server verify) and the Start button
 * reaches READY with a readiness lease.
 *
 * `onReady` fires with the lease + a `keepAlive` accessor for the connected
 * publisher room — the parent transfers that room to the attempt page on
 * start (lib/media/active-room.ts). Fires with `null` when readiness is
 * lost (retry/expiry) so the parent can re-disable Start.
 */

type ProgressStatus = Extract<
  CameraPreflightStatus,
  "permission" | "connecting" | "verifying" | "ready"
>;

const STAGE_COPY: Record<ProgressStatus, { title: string; detail?: string }> = {
  permission: { title: "Requesting camera access…" },
  connecting: {
    title: "Connecting your camera…",
    detail: "Starting the camera check — connecting to the exam room.",
  },
  verifying: {
    title: "Verifying your camera…",
    detail: "This takes a few seconds. Keep this page open.",
  },
  ready: {
    title: "Camera verified",
    detail: "Your camera check passed — you can start the attempt now.",
  },
};

const FAILURE_INFO: Record<CameraPreflightStatus, { title: string; detail: string } | null> = {
  idle: null,
  permission: null,
  connecting: null,
  verifying: null,
  ready: null,
  denied: {
    title: "Camera access was denied",
    detail:
      "Allow camera access for this site in your browser (usually the camera icon in the address bar, or site settings → Camera → Allow), then retry.",
  },
  unavailable: {
    title: "No camera found",
    detail: "We couldn't find a usable camera. Connect or enable one, then retry.",
  },
  infra: {
    title: "Camera verification is unavailable",
    detail: "The monitoring server is unavailable right now — please try again in a moment.",
  },
  timeout: {
    title: "Verification timed out",
    detail: "We couldn't verify your camera in time. Make sure your camera works, then retry.",
  },
  error: {
    title: "Camera check failed",
    detail: "Something went wrong during the camera check. Please retry.",
  },
};

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={cn("h-4 w-4 shrink-0", className)}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

export function CameraPreflightCard({
  sessionId,
  cameraRequired,
  onReady,
}: {
  sessionId: number;
  cameraRequired: boolean;
  onReady: (lease: string | null, keepAlive: () => Room | null) => void;
}) {
  const preflight = useCameraPreflight({ sessionId, cameraRequired });
  const { status, lease, lastError, keepAlive, previewRef, retry, start } = preflight;
  const notifiedLeaseRef = useRef<string | null>(null);

  // Notify the parent on READY (once per lease) and on readiness loss.
  useEffect(() => {
    const token = status === "ready" && lease ? lease.readinessLease : null;
    if (token === notifiedLeaseRef.current) return;
    notifiedLeaseRef.current = token;
    onReady(token, keepAlive);
  }, [status, lease, onReady, keepAlive]);

  const failure = FAILURE_INFO[status];
  const stage: ProgressStatus | null =
    status === "permission" ||
    status === "connecting" ||
    status === "verifying" ||
    status === "ready"
      ? status
      : null;
  const showVideo =
    stage === "permission" ||
    stage === "connecting" ||
    stage === "verifying" ||
    stage === "ready";

  return (
    <div
      className="mt-3 rounded-lg border border-[#E2E8F0] bg-white p-4"
      data-testid="camera-preflight"
    >
      <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#64748B]">
        <CameraIcon className="h-3.5 w-3.5" />
        Camera check
      </p>

      {status === "idle" && (
        <div role="status" className="mt-3">
          <p className="text-sm font-medium text-[#0F172A]">
            {cameraRequired
              ? "A quick camera check is required before you can start this attempt."
              : "A camera check is available for this session."}
          </p>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            Your camera stays on for the attempt and is recorded for review.
          </p>
          <Button type="button" size="sm" className="mt-3 gap-2" onClick={start}>
            <CameraIcon className="h-3.5 w-3.5" />
            Enable camera
          </Button>
        </div>
      )}

      {showVideo && (
        <div className="mt-3">
          <video
            ref={previewRef}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full rounded-lg bg-[#0F172A] object-cover"
          />
        </div>
      )}

      {stage && (
        <p
          role="status"
          className={cn(
            "mt-3 text-sm font-semibold",
            stage === "ready" ? "text-[#10B981]" : "text-[#0F172A]",
            stage !== "ready" && stage !== "permission" && "animate-pulse"
          )}
        >
          {stage === "ready" && "✓ "}
          {STAGE_COPY[stage].title}
          {STAGE_COPY[stage].detail && (
            <span className="mt-0.5 block text-xs font-medium text-[#64748B]">
              {STAGE_COPY[stage].detail}
            </span>
          )}
        </p>
      )}

      {failure && (
        <div role="alert" className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3">
          <p className="text-sm font-bold text-[#EF4444]">{failure.title}</p>
          <p className="mt-1 text-xs font-medium text-[#0F172A]">
            {status === "error" && lastError ? lastError : failure.detail}
          </p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={retry}>
            Retry camera check
          </Button>
        </div>
      )}
    </div>
  );
}
