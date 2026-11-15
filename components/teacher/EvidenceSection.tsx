"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchEvidenceUrl,
  fetchSessionEvidence,
  requestAlertClip,
  type EvidenceItem,
  type EvidenceProvenance,
} from "@/lib/api/evidence";
import { getSessionAiAlerts } from "@/lib/api/ai-detections";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-D teacher evidence panel (issues #91–#94). Rendered inside LiveMonitor
 * under the AI alert feed. For the selected (default: newest) alert it lists
 * SNAPSHOT thumbnails plus the alert's CLIP with honest status states.
 *
 * Honesty (CONTRACT §8 / ADR-009): CLIENT_CAPTURE snapshots are labeled
 * "Ảnh do máy thí sinh gửi" — they are student-submitted frames, NEVER
 * verification. A FAILED clip shows its real reason (NO_COVERAGE is spelled
 * out); nothing is ever fabricated or implied.
 *
 * LiveMonitor invalidates the evidence keys on EVIDENCE_ / RECORDING_ pings
 */

/** True when an ATTEMPT_ACTIVITY ping concerns evidence/recordings (P4-D). */
export function isEvidenceActivity(ev: RealtimeEventEnvelope): boolean {
  const type = ev.activityType;
  return (
    type != null && (type.startsWith("EVIDENCE_") || type.startsWith("RECORDING_"))
  );
}

export interface CoverageGap {
  from: string;
  to: string;
}

export function parseCoverageGaps(
  coverage: string | null | undefined
): CoverageGap[] {
  if (!coverage) return [];
  try {
    const parsed: unknown = JSON.parse(coverage);
    if (parsed == null || typeof parsed !== "object" || !("gaps" in parsed)) {
      return [];
    }
    const gaps: unknown = parsed.gaps;
    if (!Array.isArray(gaps)) return [];
    return gaps.filter(
      (g): g is CoverageGap =>
        g != null &&
        typeof g === "object" &&
        "from" in g &&
        "to" in g &&
        typeof g.from === "string" &&
        typeof g.to === "string"
    );
  } catch {
    return []; // malformed coverage never breaks rendering
  }
}

/** Refetch the presigned URL shortly before it dies (300s TTL) so playback
 * never silently breaks mid-review. */
const URL_REFRESH_MARGIN_MS = 30_000;

function useEvidenceUrl(sessionId: number, evidenceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "evidence-url", evidenceId],
    queryFn: () => fetchEvidenceUrl(sessionId, evidenceId),
    enabled,
    refetchInterval: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      if (expiresAt == null) return false;
      const remaining =
        new Date(expiresAt).getTime() - Date.now() - URL_REFRESH_MARGIN_MS;
      return remaining > 0 ? remaining : 1_000;
    },
  });
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

const PROVENANCE_LABEL: Record<EvidenceProvenance, string> = {
  CLIENT_CAPTURE: "Ảnh do máy thí sinh gửi",
  FULL_RECORDING: "Ảnh trích từ bản ghi đầy đủ",
  ROLLING_BUFFER: "Ảnh trích từ bộ đệm luân chuyển",
};

function SnapshotThumb({
  sessionId,
  item,
}: {
  sessionId: number;
  item: EvidenceItem;
}) {
  const playable = item.status === "AVAILABLE" || item.status === "PARTIAL";
  const { data: urlData } = useEvidenceUrl(sessionId, item.evidenceId, playable);
  const detail =
    item.status === "FAILED"
      ? `Lỗi: ${item.error ?? "không rõ"}`
      : item.status === "PENDING"
        ? "Đang xử lý…"
        : formatTime(item.capturedAt);
  return (
    <figure
      data-testid="evidence-snapshot"
      className="w-32 shrink-0 rounded-lg border border-[#E2E8F0] bg-white p-2"
    >
      {playable && urlData?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned URL (300s TTL) must not pass through the Next image optimizer
        <img
          src={urlData.url}
          alt={`Ảnh minh chứng ${formatTime(item.capturedAt)}`}
          className="h-20 w-full rounded-md border border-[#E2E8F0] object-cover"
        />
      ) : (
        <div className="flex h-20 w-full items-center justify-center rounded-md border border-dashed border-[#E2E8F0] px-1 text-center text-[10px] font-medium text-[#94A3B8]">
          {item.status === "EXPIRED" ? "Đã hết hạn" : "Không xem được"}
        </div>
      )}
      <figcaption className="mt-1 space-y-0.5">
        <p className="text-[10px] font-semibold text-[#0F172A]">
          {PROVENANCE_LABEL[item.provenance]}
        </p>
        <p className="font-mono text-[10px] text-[#94A3B8]">{detail}</p>
      </figcaption>
    </figure>
  );
}

function ClipRow({
  sessionId,
  alertId,
  clip,
}: {
  sessionId: number;
  alertId: number;
  clip: EvidenceItem | null;
}) {
  const queryClient = useQueryClient();
  const [clipError, setClipError] = useState<string | null>(null);
  const [showGaps, setShowGaps] = useState(false);
  const playable =
    clip != null && (clip.status === "AVAILABLE" || clip.status === "PARTIAL");
  const { data: urlData } = useEvidenceUrl(
    sessionId,
    clip?.evidenceId ?? "",
    playable
  );

  const clipMut = useMutation({
    mutationFn: () => requestAlertClip(sessionId, alertId),
    onSuccess: () => {
      setClipError(null);
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "evidence"],
      });
    },
    onError: (err: unknown) => {
      const norm = err as NormalizedApiError | undefined;
      setClipError(
        norm?.kind === "api" && norm.code === "EVIDENCE_CLIP_REJECTED"
          ? "Clip đã bị tắt trong cấu hình giám sát của buổi thi."
          : "Không tạo được clip — thử lại."
      );
    },
  });

  const gaps = parseCoverageGaps(clip?.coverage);

  return (
    <div data-testid="evidence-clip" className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[#0F172A]">Clip quanh cảnh báo</span>
        {clip == null && (
          <button
            type="button"
            onClick={() => clipMut.mutate()}
            disabled={clipMut.isPending}
            className="rounded-lg bg-[#0052FF] px-2.5 py-1 text-[11px] font-semibold text-white outline-none transition-colors hover:bg-[#0052FF]/90 focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:opacity-60"
          >
            {clipMut.isPending ? "Đang tạo…" : "Tạo clip"}
          </button>
        )}
        {clip?.status === "PENDING" && (
          <span className="text-[11px] font-medium text-[#64748B]">Đang trích xuất…</span>
        )}
        {clip?.status === "AVAILABLE" && (
          <span className="text-[11px] font-semibold text-[#10B981]">Xem clip</span>
        )}
        {clip?.status === "PARTIAL" && (
          <>
            <span className="text-[11px] font-semibold text-[#F59E0B]">Clip một phần</span>
            {gaps.length > 0 && (
              <button
                type="button"
                onClick={() => setShowGaps((v) => !v)}
                className="text-[11px] font-semibold text-[#0052FF] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
              >
                {showGaps ? "Ẩn khoảng trống" : "Xem khoảng trống"}
              </button>
            )}
          </>
        )}
        {clip?.status === "FAILED" && (
          <span className="text-[11px] font-medium text-[#EF4444]" data-testid="evidence-clip-error">
            {clip.error === "NO_COVERAGE"
              ? "Không tạo được clip — Không có footage bao phủ thời điểm cảnh báo"
              : `Không tạo được clip — ${clip.error ?? "lỗi không rõ"}`}
          </span>
        )}
        {clip?.status === "EXPIRED" && (
          <span className="text-[11px] font-medium text-[#94A3B8]">Đã hết hạn</span>
        )}
      </div>

      {clipError && (
        <p role="alert" className="mt-2 text-[11px] font-medium text-[#EF4444]">
          {clipError}
        </p>
      )}

      {showGaps && gaps.length > 0 && (
        <ul data-testid="evidence-clip-gaps" className="mt-2 space-y-1">
          {gaps.map((gap, i) => (
            <li key={i} className="font-mono text-[11px] text-[#64748B]">
              Khoảng trống {formatTime(gap.from)} → {formatTime(gap.to)}
            </li>
          ))}
        </ul>
      )}

      {playable && urlData?.url && (
        <video
          data-testid="evidence-clip-video"
          controls
          preload="metadata"
          src={urlData.url}
          className="mt-3 w-full max-w-[480px] rounded-lg border border-[#E2E8F0]"
        />
      )}
    </div>
  );
}

export function EvidenceSection({ sessionId }: { sessionId: number }) {
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);

  // Same key as AiAlertFeed — one cached REST backfill for both panels.
  const { data: alertsData } = useQuery({
    queryKey: ["exam-sessions", sessionId, "ai-alerts"],
    queryFn: () => getSessionAiAlerts(sessionId, { limit: 20 }),
    enabled: Number.isFinite(sessionId) && sessionId > 0,
  });
  const alerts = alertsData?.items ?? [];
  const activeAlertId = selectedAlertId ?? alerts[0]?.alertId ?? null;

  const { data: evidence, isPending } = useQuery({
    queryKey: ["exam-sessions", sessionId, "evidence", activeAlertId],
    queryFn: () =>
      fetchSessionEvidence(sessionId, { alertId: activeAlertId ?? 0 }),
    enabled: activeAlertId != null,
  });

  const items = evidence ?? [];
  const snapshots = items.filter((e) => e.kind === "SNAPSHOT");
  const clip = items.find((e) => e.kind === "CLIP") ?? null;

  return (
    <div
      data-testid="evidence-section"
      className={cn(cardVariants(), "mt-6 p-6")}
    >
      <h3 className="font-display text-base font-bold tracking-tight text-[#0F172A]">
        Ảnh &amp; clip minh chứng
      </h3>
      <p className="mb-4 mt-1 text-xs font-medium text-[#94A3B8]">
        Ảnh/clip là ghi chép thô — không tự động kết luận vi phạm.
      </p>

      {alerts.length === 0 ? (
        <p className="text-sm text-[#64748B]">
          Chưa có cảnh báo nào để xem minh chứng.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {alerts.slice(0, 6).map((alert) => (
              <button
                key={alert.alertId}
                type="button"
                onClick={() => setSelectedAlertId(alert.alertId)}
                aria-pressed={alert.alertId === activeAlertId}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0052FF]",
                  alert.alertId === activeAlertId
                    ? "border-[#0052FF] bg-[#0052FF]/5 text-[#0052FF]"
                    : "border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]"
                )}
              >
                {`#${alert.alertId} · ${alert.studentName ?? `#${alert.studentUserId}`}`}
              </button>
            ))}
          </div>

          {isPending ? (
            <p className="text-sm text-[#64748B]">Đang tải minh chứng…</p>
          ) : (
            <div className="space-y-3">
              {snapshots.length === 0 && clip == null ? (
                <p className="text-sm text-[#64748B]">
                  Chưa có minh chứng cho cảnh báo này.
                </p>
              ) : null}
              {snapshots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {snapshots.map((snap) => (
                    <SnapshotThumb
                      key={snap.evidenceId}
                      sessionId={sessionId}
                      item={snap}
                    />
                  ))}
                </div>
              )}
              {activeAlertId != null && (
                <ClipRow sessionId={sessionId} alertId={activeAlertId} clip={clip} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
