"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { fetchAttemptMediaStatus } from "@/lib/api/evidence";

/**
 * P4-D recording status pill for the attempt header — sits beside the AI
 * pill. Informational ONLY: recording/buffer state never blocks answering.
 * Hidden when the attempt is unmonitored, while the status is loading or
 * failed, and when neither full recording nor the rolling buffer is active
 * (feature off).
 */

/** Media-status is policy-derived and stable — refetch at most every 60s. */
const MEDIA_STATUS_STALE_MS = 60_000;

function Pill({ label, dot, text }: { label: string; dot: string; text: string }) {
  return (
    <span
      data-testid="recording-status-pill"
      role="status"
      aria-live="polite"
      className={cn("text-[10px] font-semibold", text)}
    >
      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", dot)} />
      {label}
    </span>
  );
}

export function RecordingStatusPill({
  attemptId,
  active,
}: {
  attemptId: number;
  /** False for unmonitored attempts (camera "inactive") — pill hidden. */
  active: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["attempts", attemptId, "media-status"],
    queryFn: () => fetchAttemptMediaStatus(attemptId),
    enabled: active && Number.isFinite(attemptId) && attemptId > 0,
    staleTime: MEDIA_STATUS_STALE_MS,
  });

  if (data == null) return null;
  if (data.fullRecordingEnabled) {
    return (
      <Pill
        label="Buổi thi được ghi hình"
        dot="bg-[#10B981]"
        text="text-[#10B981]"
      />
    );
  }
  if (data.rollingBufferActive) {
    return (
      <Pill
        label="Buổi thi lưu đệm phục vụ clip"
        dot="bg-[#0052FF]"
        text="text-[#0052FF]"
      />
    );
  }
  return null;
}
