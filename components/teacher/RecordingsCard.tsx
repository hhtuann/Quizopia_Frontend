"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchRecordingUrl,
  fetchSessionRecordings,
  type RecordingSegment,
} from "@/lib/api/evidence";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * P4-D teacher recordings card (issue #94) — rendered by the session detail
 * for monitored sessions, collapsed by default (recording segments are a
 * review-time forensic aid, not a live surface). Lists recording job
 * segments with kind/status/time/size; servable segments (COMPLETE, object
 * still present) are PLAYABLE on demand via a presigned URL that is
 * re-fetched while playing once <30s TTL remains. Plus DERIVED coverage
 * gaps: sorted segments with >2s between prev.endedAt and next.startedAt
 * are real gaps (smaller ones are pulse-restart cost — same threshold
 * family as the backend clip coverage).
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

/** Re-fetch the presigned URL once less than this TTL remains (while the
 * teacher is actually playing — mirrors EvidenceSection's pattern). */
const URL_REFRESH_MARGIN_MS = 30_000;

/** A segment is playable only when the backend could serve it an object:
 * COMPLETE, not deleted, with a media object behind it (objectKey when the
 * wire exposes it, otherwise bytes as the object-written signal). */
export function isSegmentPlayable(segment: RecordingSegment): boolean {
  return (
    segment.status === "COMPLETE" &&
    !segment.objectDeleted &&
    (segment.objectKey != null || segment.bytes != null)
  );
}

/** "Phát" → presigned <video>; the URL re-fetches before expiry while the
 * clip is playing so playback never silently dies mid-review. A URL swap
 * mid-playback resumes from the same position (a fresh src would otherwise
 * reset the element to 0:00). */
function SegmentPlayer({ sessionId, jobId }: { sessionId: number; jobId: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Last observed playback state — updated on EVERY media event, so a URL
  // swap can read where the teacher was before the element resets.
  const positionRef = useRef({ time: 0, playing: false });
  const resumeAtRef = useRef<number | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const { data, isError } = useQuery({
    queryKey: ["exam-sessions", sessionId, "recording-url", jobId],
    queryFn: () => fetchRecordingUrl(sessionId, jobId),
    enabled: open,
    refetchInterval: (query) => {
      if (!playing) return false;
      const expiresAt = query.state.data?.expiresAt;
      if (expiresAt == null) return false;
      const remaining =
        new Date(expiresAt).getTime() - Date.now() - URL_REFRESH_MARGIN_MS;
      return remaining > 0 ? remaining : 1_000;
    },
  });

  useEffect(() => {
    const url = data?.url ?? null;
    if (url == null || url === lastUrlRef.current) return;
    if (lastUrlRef.current != null && positionRef.current.playing) {
      // URL swapped mid-playback: remember the position to restore once
      // the new presigned object's metadata has loaded.
      resumeAtRef.current = positionRef.current.time;
    }
    lastUrlRef.current = url;
  }, [data?.url]);

  return (
    <div className="ml-auto flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-[#0052FF] px-2.5 py-1 text-[11px] font-semibold text-white outline-none transition-colors hover:bg-[#0052FF]/90 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
      >
        {open ? "Ẩn" : "Phát"}
      </button>
      {open && isError && (
        <p
          role="alert"
          className="max-w-[480px] text-right text-[11px] font-medium text-[#EF4444]"
        >
          Không phát được đoạn ghi hình này (có thể đã hết hạn hoặc bị dọn dẹp).
        </p>
      )}
      {open && data?.url != null && (
        <video
          data-testid="recording-video"
          controls
          preload="metadata"
          src={data.url}
          onPlay={() => {
            positionRef.current.playing = true;
            setPlaying(true);
          }}
          onPause={() => {
            positionRef.current.playing = false;
            setPlaying(false);
          }}
          onEnded={() => {
            positionRef.current.playing = false;
            setPlaying(false);
          }}
          onTimeUpdate={(ev) => {
            positionRef.current.time = ev.currentTarget.currentTime;
          }}
          onLoadedMetadata={(ev) => {
            const resumeAt = resumeAtRef.current;
            if (resumeAt == null) return;
            resumeAtRef.current = null;
            ev.currentTarget.currentTime = resumeAt;
            void ev.currentTarget.play().catch(() => undefined);
          }}
          className="w-full max-w-[480px] rounded-lg border border-[#E2E8F0]"
        />
      )}
    </div>
  );
}

function SegmentRow({
  sessionId,
  segment,
}: {
  sessionId: number;
  segment: RecordingSegment;
}) {
  return (
    <li
      data-testid="recording-segment"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs"
    >
      <span className="font-semibold text-[#0F172A]">
        {KIND_LABEL[segment.kind]}
      </span>
      <span className="rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
        {segment.status}
      </span>
      <span className="font-mono text-[#64748B]">
        {formatTime(segment.startedAt)} → {formatTime(segment.endedAt)}
      </span>
      <span className="text-[#64748B]">{formatBytes(segment.bytes)}</span>
      {segment.error != null && (
        <span className="text-[10px] font-medium text-[#EF4444]">
          {segment.error}
        </span>
      )}
      {segment.objectDeleted ? (
        <span
          data-testid="recording-cleaned"
          className="ml-auto text-[10px] font-medium text-[#94A3B8]"
        >
          Đã dọn dẹp
        </span>
      ) : isSegmentPlayable(segment) ? (
        <SegmentPlayer sessionId={sessionId} jobId={segment.jobId} />
      ) : (
        <span className="ml-auto text-[10px] font-medium text-[#94A3B8]">—</span>
      )}
    </li>
  );
}

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
                <SegmentRow key={seg.jobId} sessionId={sessionId} segment={seg} />
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
