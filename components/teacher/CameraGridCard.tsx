"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConnectionQuality } from "livekit-client";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  revokeCameraParticipant,
  type CameraParticipantStatus,
} from "@/lib/api/media";
import { useCameraGrid } from "@/lib/media/use-camera-grid";
import { CameraTile } from "./CameraTile";

/**
 * P4-B: teacher camera monitoring card (issues #84–#87). Rendered by the
 * session detail ONLY for monitored sessions. Subscribes to every camera
 * publisher at the LOW simulcast layer (single HIGH for fullscreen — see
 * `useCameraGrid`); tile roster/state metadata comes from the REST
 * camera-status query owned by the page (`["exam-sessions", id,
 * "camera-status"]`, invalidated on CAMERA_ or MONITORING_GAP activity).
 *
 * Privacy: consented demo surfaces — no audio is ever subscribed (the teacher
 * token grants subscribe on video tracks only; tiles render <video muted>).
 */

export function CameraGridCard({
  sessionId,
  participants,
}: {
  sessionId: number;
  /** Camera-status roster with display names resolved by the page. */
  participants: CameraParticipantStatus[];
}) {
  const queryClient = useQueryClient();
  const { status, tiles, fullscreenIdentity, selectForFullscreen } = useCameraGrid(sessionId, true);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const exitFullscreen = useCallback(() => selectForFullscreen(null), [selectForFullscreen]);

  const revokeMut = useMutation({
    mutationFn: (identity: string) => revokeCameraParticipant(sessionId, identity),
    onSuccess: () => {
      setRevokeError(null);
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "camera-status"],
      });
    },
    onError: () => setRevokeError("Could not revoke camera access. Try again."),
  });

  const indicator =
    status === "live"
      ? { label: "Live", tone: "text-[#10B981]", pulse: false }
      : status === "reconnecting"
        ? { label: "Reconnecting…", tone: "text-[#F59E0B]", pulse: true }
        : status === "connecting"
          ? { label: "Connecting…", tone: "text-[#0052FF]", pulse: true }
          : { label: "Offline", tone: "text-[#94A3B8]", pulse: false };

  return (
    <div data-testid="camera-grid" className={cn(cardVariants(), "mt-6 p-6")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Camera monitoring
          </h2>
          <span className="rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
            Consented demo · no audio
          </span>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={cn("text-xs font-semibold", indicator.tone, indicator.pulse && "animate-pulse")}
        >
          ● {indicator.label}
        </span>
      </div>

      {revokeError && (
        <p role="alert" className="mb-3 text-sm font-medium text-[#EF4444]">
          {revokeError}
        </p>
      )}

      {participants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E2E8F0] px-4 py-8 text-center text-sm font-medium text-[#64748B]">
          No camera participants yet. Tiles appear when monitored students connect their cameras.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {participants.map((participant) => {
            const media = tiles.get(participant.mediaIdentity);
            return (
              <CameraTile
                key={participant.mediaIdentity}
                identity={participant.mediaIdentity}
                displayName={participant.displayName}
                state={participant.state}
                attemptId={participant.attemptId}
                connectedSince={participant.connectedSince}
                lastVerifiedAt={participant.lastVerifiedAt}
                track={media?.track ?? null}
                muted={media?.muted ?? false}
                connectionQuality={media?.connectionQuality ?? ConnectionQuality.Unknown}
                isFullscreen={fullscreenIdentity === participant.mediaIdentity}
                onFullscreen={selectForFullscreen}
                onExitFullscreen={exitFullscreen}
                onRevoke={(identity) => revokeMut.mutate(identity)}
                revoking={revokeMut.isPending}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
