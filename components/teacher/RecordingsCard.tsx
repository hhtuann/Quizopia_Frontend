"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionRecordings, type RecordingSegment } from "@/lib/api/evidence";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * P4-D teacher recordings card (issue #94) — rendered by the session detail
 * for monitored sessions, collapsed by default (recording segments are a
 * review-time forensic aid, not a live surface). Lists recording job
 * segments with kind/status/time/size plus DERIVED coverage gaps: sorted
 * segments with >2s between prev.endedAt and next.startedAt are real gaps
 * (smaller ones are pulse-restart cost — same threshold family as the
 * backend clip coverage).
 */

/** Gaps strictly larger than this count as footage holes. */
export const RECORDING_GAP_THRESHOLD_MS = 2_000;

export interface RecordingGap {
  /** End of the segment before the hole (epoch ms). */
  afterMs: number;
  /** Start of the segment after the hole (epoch ms). */
  beforeMs: number;
  gapMs: number;
}

/** Derived gaps between sorted segments (pure). Only segments the backend
 * could actually serve coverage from count (mirror of its findCovering):
 * COMPLETE jobs whose object still exists — deleted/incomplete rows would
 * fabricate coverage that no longer (or never) existed. */
export function deriveRecordingGaps(segments: RecordingSegment[]): RecordingGap[] {
  const bounded = segments.filter(
    (s) =>
      s.status === "COMPLETE" &&
      !s.objectDeleted &&
      s.startedAt != null &&
      s.endedAt != null
  );
  const sorted = [...bounded].sort(
    (a, b) =>
      new Date(a.startedAt ?? 0).getTime() - new Date(b.startedAt ?? 0).getTime()
  );
  const gaps: RecordingGap[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = new Date(sorted[i - 1]!.endedAt ?? 0).getTime();
    const nextStart = new Date(sorted[i]!.startedAt ?? 0).getTime();
    const gapMs = nextStart - prevEnd;
    if (gapMs > RECORDING_GAP_THRESHOLD_MS) {
      gaps.push({ afterMs: prevEnd, beforeMs: nextStart, gapMs });
    }
  }
  return gaps;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_LABEL: Record<RecordingSegment["kind"], string> = {
  FULL: "Ghi hình đầy đủ",
  ROLLING: "Bộ đệm luân chuyển",
};

export function RecordingsCard({ sessionId }: { sessionId: number }) {
  const [open, setOpen] = useState(false);

  // Collapsed by default → the list is fetched lazily on first expand.
  const { data, isPending, isError } = useQuery({
    queryKey: ["exam-sessions", sessionId, "recordings"],
    queryFn: () => fetchSessionRecordings(sessionId),
    enabled: open && Number.isFinite(sessionId) && sessionId > 0,
  });

  const segments = useMemo(() => data ?? [], [data]);
  const gaps = useMemo(() => deriveRecordingGaps(segments), [segments]);

  return (
    <div data-testid="recordings-card" className={cn(cardVariants(), "mt-6 p-6")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Ghi hình buổi thi
          </h2>
          <p className="mt-0.5 text-xs font-medium text-[#94A3B8]">
            Segments ghi hình/bộ đệm — xem để đối chiếu, không tự động kết luận.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
        >
          {open ? "Thu gọn" : "Xem ghi hình"}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          {isPending && <p className="text-sm text-[#64748B]">Đang tải ghi hình…</p>}
          {isError && (
            <p className="text-sm text-[#64748B]">
              Chưa tải được danh sách ghi hình — dữ liệu này không ảnh hưởng buổi thi.
            </p>
          )}
          {!isPending && !isError && segments.length === 0 && (
            <p className="text-sm text-[#64748B]">
              Chưa có segment ghi hình nào (buổi thi không bật ghi hình/bộ đệm).
            </p>
          )}
          {segments.length > 0 && (
            <ul data-testid="recordings-list" className="space-y-2">
              {segments.map((seg) => (
                <li
                  key={seg.jobId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-[#0F172A]">
                    {KIND_LABEL[seg.kind]}
                  </span>
                  <span className="rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                    {seg.status}
                  </span>
                  <span className="font-mono text-[#64748B]">
                    {formatTime(seg.startedAt)} → {formatTime(seg.endedAt)}
                  </span>
                  <span className="text-[#64748B]">{formatBytes(seg.bytes)}</span>
                  {seg.objectDeleted && (
                    <span className="text-[10px] font-medium text-[#94A3B8]">
                      Tệp đã xóa theo chính sách lưu trữ
                    </span>
                  )}
                  {seg.error != null && (
                    <span className="text-[10px] font-medium text-[#EF4444]">
                      {seg.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {gaps.length > 0 && (
            <ul data-testid="recordings-gaps" className="mt-3 space-y-1">
              {gaps.map((gap, i) => (
                <li key={i} className="font-mono text-[11px] text-[#F59E0B]">
                  Khoảng trống {Math.round(gap.gapMs / 100) / 10}s (
                  {formatTime(new Date(gap.afterMs).toISOString())} →{" "}
                  {formatTime(new Date(gap.beforeMs).toISOString())})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
