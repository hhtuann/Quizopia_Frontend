"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSessionAiAlerts,
  type AiAlertItem,
} from "@/lib/api/ai-detections";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-C teacher AI alert feed (CONTRACT §5/§6). Sits in the LiveMonitor
 * layout. REST backfill `GET /api/exam-sessions/{id}/ai-alerts` on mount;
 * LiveMonitor invalidates this query on AI_ALERT_* activity pings and on WS
 * reconnect (REST is the source of truth). Cursor merge: newer pages are
 * merged by alertId, newest first.
 *
 * Honesty (CONTRACT §8): cards show observations with confidence + provenance
 * and the disclaimer "Quan sát bằng AI — không tự động kết luận vi phạm."
 * The bbox mini-render draws ONLY normalized boxes from latestDetections —
 * no image is ever stored or shown (evidence media is P4-D).
 */

/** True when an ATTEMPT_ACTIVITY ping concerns the AI alert feed. */
export function isAiAlertActivity(ev: RealtimeEventEnvelope): boolean {
  const type = ev.activityType;
  return type != null && type.startsWith("AI_ALERT_");
}

/** Union by alertId, sorted newest (highest id) first. Pure — unit-tested. */
export function mergeAlertItems(
  prev: AiAlertItem[],
  next: AiAlertItem[]
): AiAlertItem[] {
  const byId = new Map<number, AiAlertItem>();
  for (const item of prev) byId.set(item.alertId, item);
  for (const item of next) byId.set(item.alertId, item); // next wins (fresher)
  return [...byId.values()].sort((a, b) => b.alertId - a.alertId);
}

const ALERT_LABEL: Record<AiAlertItem["alertType"], string> = {
  PHONE_DETECTED: "Phát hiện điện thoại",
  SCREEN_DETECTED: "Phát hiện màn hình phụ",
  MULTIPLE_PERSONS_DETECTED: "Nhiều người trong khung hình",
  PERSON_NOT_VISIBLE: "Không thấy người làm bài",
};

const BOX_CLASS_LABEL: Record<number, string> = {
  0: "person",
  62: "tv",
  63: "laptop",
  67: "cell phone",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AiAlertFeed({ sessionId }: { sessionId: number }) {
  const PAGE_SIZE = 20;
  const queryClient = useQueryClient();
  // Older pages append on user action; the live page-1 query refetches on
  // AI_ALERT_* pings — the render-time merge below unions them (cursor
  // merge, newest first) without cascading effect setState.
  const [olderItems, setOlderItems] = useState<AiAlertItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["exam-sessions", sessionId, "ai-alerts"],
    queryFn: () => getSessionAiAlerts(sessionId, { limit: PAGE_SIZE }),
    enabled: Number.isFinite(sessionId) && sessionId > 0,
  });

  const items = useMemo(
    () => mergeAlertItems(olderItems, data?.items ?? []),
    [olderItems, data]
  );

  const loadOlder = async (): Promise<void> => {
    const cursor = items.length > 0 ? items[items.length - 1].alertId : undefined;
    if (cursor == null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await getSessionAiAlerts(sessionId, { cursor, limit: PAGE_SIZE });
      setOlderItems((prev) => mergeAlertItems(prev, older.items));
      setHasMore(older.nextCursor != null);
    } catch {
      // Older-page backfill failure is non-fatal; the button stays.
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className={cn(cardVariants(), "mt-6 p-6")} data-testid="ai-alert-feed">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold tracking-tight text-[#0F172A]">
          Cảnh báo AI
        </h3>
        <button
          type="button"
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: ["exam-sessions", sessionId, "ai-alerts"],
            })
          }
          className="rounded-lg px-2 py-1 text-xs font-semibold text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
        >
          Làm mới
        </button>
      </div>
      <p className="mb-4 text-xs font-medium text-[#94A3B8]">
        Quan sát bằng AI — không tự động kết luận vi phạm.
      </p>

      {isPending && <p className="text-sm text-[#64748B]">Đang tải cảnh báo…</p>}
      {isError && (
        <p className="text-sm text-[#64748B]">
          Chưa tải được cảnh báo — dữ liệu khu vực này không ảnh hưởng buổi thi.
        </p>
      )}
      {!isPending && !isError && items.length === 0 && (
        <p className="text-sm text-[#64748B]">Chưa có cảnh báo AI.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((alert) => (
            <li key={alert.alertId}>
              <AiAlertCard alert={alert} />
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && hasMore && (
        <button
          type="button"
          onClick={() => void loadOlder()}
          disabled={loadingOlder}
          className="mt-3 text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:text-[#0052FF]/80 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
        >
          {loadingOlder ? "Đang tải…" : "Tải cảnh báo cũ hơn"}
        </button>
      )}
    </div>
  );
}

export function AiAlertCard({ alert }: { alert: AiAlertItem }) {
  const confidence =
    alert.maxConfidence != null ? `${Math.round(alert.maxConfidence * 100)}%` : "—";
  const first = formatTime(alert.firstDetectedAt);
  const last = formatTime(alert.lastDetectedAt);
  const window =
    first === last ? first : `${first} → ${last}`;
  const provenance =
    alert.provenance === "WORKER_VERIFIED"
      ? "WORKER"
      : alert.provenance === "CLIENT_MODEL"
        ? "CLIENT MODEL"
        : "—";
  const detections = alert.latestDetections ?? [];

  return (
    <div
      data-testid="ai-alert-card"
      className="rounded-xl border border-[#E2E8F0] bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#0F172A]">
            {alert.studentName ?? `#${alert.studentUserId}`}
          </span>
          <span className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-2 py-0.5 text-[11px] font-semibold text-[#F59E0B]">
            {ALERT_LABEL[alert.alertType]}
          </span>
          <span className="rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-[#64748B]">
            {provenance}
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#94A3B8]">{last}</span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <div>
          <dt className="text-[#94A3B8]">Độ tin cậy</dt>
          <dd className="font-semibold text-[#0F172A]">{confidence}</dd>
        </div>
        <div>
          <dt className="text-[#94A3B8]">Số lần phát hiện</dt>
          <dd className="font-semibold text-[#0F172A]">{alert.detectionCount}</dd>
        </div>
        <div>
          <dt className="text-[#94A3B8]">Khoảng thời gian</dt>
          <dd className="font-semibold text-[#0F172A]">{window}</dd>
        </div>
        <div>
          <dt className="text-[#94A3B8]">Mô hình</dt>
          <dd className="font-mono font-semibold text-[#0F172A]">
            {alert.modelId && alert.modelVersion
              ? `${alert.modelId}@${alert.modelVersion}`
              : "—"}
          </dd>
        </div>
      </dl>

      {detections.length > 0 && (
        <div className="mt-3">
          <div
            className="relative w-full max-w-[240px] overflow-hidden rounded-lg border border-[#334155] bg-[#0F172A]"
            style={{ aspectRatio: "4 / 3" }}
            data-testid="ai-alert-bboxes"
            aria-label="bbox từ khung phân tích — không lưu ảnh (P4-D)"
          >
            {detections.map((d, i) => {
              const [x1, y1, x2, y2] = d.bbox;
              return (
                <div
                  key={i}
                  className="absolute border border-[#F59E0B] bg-[#F59E0B]/10"
                  style={{
                    left: `${x1 * 100}%`,
                    top: `${y1 * 100}%`,
                    width: `${Math.max(0, (x2 - x1)) * 100}%`,
                    height: `${Math.max(0, (y2 - y1)) * 100}%`,
                  }}
                >
                  <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-[#F59E0B] px-1 text-[8px] font-bold leading-tight text-[#0F172A]">
                    {BOX_CLASS_LABEL[d.classId] ?? d.label} {Math.round(d.confidence * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">
            bbox từ khung phân tích — không lưu ảnh (P4-D)
          </p>
        </div>
      )}
    </div>
  );
}
