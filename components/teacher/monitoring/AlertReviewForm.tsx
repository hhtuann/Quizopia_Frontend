"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SegmentedControl } from "@/components/ui";
import type { AiAlertItem } from "@/lib/api/ai-detections";
import {
  getAlertReviews,
  newIdempotencyKey,
  reviewConflictMessage,
  submitAlertReview,
  type AlertReviewAction,
  type AlertReviewStatus,
} from "@/lib/api/alert-review";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * P4-E alert review form (design §4) — mounted inside AiAlertCard. Teacher
 * assessment layered OVER the AI observation: the five actions are review
 * bookkeeping, never a misconduct verdict (the card keeps its AI disclaimer).
 *
 * Optimistic versioning: `expectedVersion` comes from the alert row; a 409
 * MONITORING_REVIEW_VERSION_CONFLICT surfaces the server message (it carries
 * the current version) with an explicit acknowledge-and-retry flow. The
 * Idempotency-Key is a fresh UUID per submit intent — regenerated after
 * success and after an acknowledged conflict, never reused for a new intent.
 */

/** Vietnamese action labels (fallback = raw enum, mirroring ALERT_LABEL). */
export const REVIEW_ACTION_LABEL: Record<AlertReviewAction, string> = {
  MARK_VIEWED: "Đã xem",
  FALSE_POSITIVE: "Báo động sai",
  NEEDS_FOLLOW_UP: "Cần theo dõi thêm",
  NOTED: "Ghi chú",
  REVIEWED_NO_CONCLUSION: "Đã xét — không kết luận",
};

/** Vietnamese review-status labels (provenance chip on the card). */
export const REVIEW_STATUS_LABEL: Record<AlertReviewStatus, string> = {
  UNREVIEWED: "Chưa được xác minh",
  VIEWED: "Đã xem",
  FALSE_POSITIVE: "Báo động sai",
  NEEDS_FOLLOW_UP: "Cần theo dõi thêm",
  NOTED: "Đã ghi chú",
  REVIEWED_NO_CONCLUSION: "Đã xét — không kết luận",
};

export function reviewActionLabel(action: AlertReviewAction): string {
  return REVIEW_ACTION_LABEL[action] ?? action;
}

export const REVIEW_ACTIONS: readonly AlertReviewAction[] = [
  "MARK_VIEWED",
  "FALSE_POSITIVE",
  "NEEDS_FOLLOW_UP",
  "NOTED",
  "REVIEWED_NO_CONCLUSION",
];

const NOTE_MAX_LENGTH = 1000;

export function AlertReviewForm({
  sessionId,
  alert,
}: {
  sessionId: number;
  alert: AiAlertItem;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AlertReviewAction>("MARK_VIEWED");
  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const reviewMut = useMutation({
    mutationFn: () =>
      submitAlertReview(
        alert.alertId,
        {
          expectedVersion: alert.reviewVersion ?? 0,
          action,
          note: note.trim().length > 0 ? note.trim() : undefined,
        },
        idempotencyKey
      ),
    onSuccess: (result) => {
      setSuccessMessage(
        result.idempotentReplay
          ? `Yêu cầu trùng lặp — giữ nguyên đánh giá phiên ${result.reviewVersion}.`
          : `Đã lưu đánh giá (phiên ${result.reviewVersion}).`
      );
      setConflictMessage(null);
      setErrorMessage(null);
      setNote("");
      // New intent ⇒ new key (the old one would replay the stored outcome).
      setIdempotencyKey(newIdempotencyKey());
      // REST is the source of truth: alert feed rows (review rollup), the
      // dashboard aggregates, the attempt timeline (ALERT_REVIEW_RECORDED)
      // and this alert's review history all refetch.
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "ai-alerts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "monitoring-overview"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "monitoring-participants"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["attempts", alert.attemptId, "timeline"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["alerts", alert.alertId, "reviews"],
      });
    },
    onError: (err: unknown) => {
      const conflict = reviewConflictMessage(err);
      if (conflict != null) {
        // Server message includes the current version; refetch so the form's
        // expectedVersion picks up the fresh row on retry.
        setConflictMessage(conflict);
        void queryClient.invalidateQueries({
          queryKey: ["exam-sessions", sessionId, "ai-alerts"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["alerts", alert.alertId, "reviews"],
        });
      } else {
        setErrorMessage("Không lưu được đánh giá — thử lại.");
      }
      setSuccessMessage(null);
    },
  });

  const historyQuery = useQuery({
    queryKey: ["alerts", alert.alertId, "reviews"],
    queryFn: () => getAlertReviews(alert.alertId),
    enabled: historyOpen,
  });

  const submit = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setConflictMessage(null);
    reviewMut.mutate();
  };

  const acknowledgeConflict = () => {
    // Conflict acknowledged ⇒ new idempotency key; the refetched alert row
    // supplies the current expectedVersion for the retry.
    setConflictMessage(null);
    setIdempotencyKey(newIdempotencyKey());
  };

  return (
    <div
      data-testid="alert-review-form"
      className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/60 p-3"
    >
      <p className="text-xs font-bold text-[#0F172A]">Đánh giá của giảng viên</p>
      <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
        Ghi chép quá trình xem xét — không phải kết luận vi phạm.
      </p>

      <div className="mt-3">
        <SegmentedControl
          aria-label="Hành động đánh giá"
          value={action}
          onChange={(next) => setAction(next)}
          options={REVIEW_ACTIONS.map((value) => ({
            value,
            label: reviewActionLabel(value),
          }))}
        />
      </div>

      <label
        htmlFor={`review-note-${alert.alertId}`}
        className="mb-1 mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]"
      >
        Ghi chú (không bắt buộc)
      </label>
      <textarea
        id={`review-note-${alert.alertId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        aria-describedby={`review-note-counter-${alert.alertId}`}
        aria-invalid={errorMessage != null || undefined}
        className="w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition-colors focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
      />
      <p
        id={`review-note-counter-${alert.alertId}`}
        className="mt-0.5 text-right font-mono text-[10px] tabular-nums text-[#94A3B8]"
      >
        {note.length}/{NOTE_MAX_LENGTH}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={reviewMut.isPending}
        >
          {reviewMut.isPending ? "Đang lưu…" : "Lưu đánh giá"}
        </Button>
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-controls={`review-history-${alert.alertId}`}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:text-[#0052FF]/80 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
        >
          {historyOpen ? "Ẩn lịch sử đánh giá" : "Xem lịch sử đánh giá"}
        </button>
      </div>

      {successMessage && (
        <p role="status" className="mt-2 text-xs font-semibold text-[#10B981]">
          {successMessage}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="mt-2 text-xs font-semibold text-[#EF4444]">
          {errorMessage}
        </p>
      )}
      {conflictMessage && (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-2.5 text-xs font-medium text-[#F59E0B]"
        >
          <p>{conflictMessage}</p>
          <button
            type="button"
            onClick={acknowledgeConflict}
            className="mt-1.5 rounded-lg font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
          >
            Đã hiểu — dùng phiên bản mới
          </button>
        </div>
      )}

      <div
        id={`review-history-${alert.alertId}`}
        hidden={!historyOpen}
        className="mt-3"
      >
        {historyQuery.isPending ? (
          <p className="text-xs text-[#64748B]">Đang tải lịch sử…</p>
        ) : historyQuery.isError ? (
          <p className="text-xs text-[#64748B]">
            Chưa tải được lịch sử đánh giá.
          </p>
        ) : (historyQuery.data?.history.length ?? 0) === 0 ? (
          <p className="text-xs text-[#64748B]">Chưa có đánh giá nào.</p>
        ) : (
          <ul className="space-y-1.5" data-testid="alert-review-history">
            {historyQuery.data?.history.map((entry) => (
              <li
                key={entry.version}
                className={cn(
                  "rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-[#64748B]">
                    v{entry.version}
                  </span>
                  <span className="font-semibold text-[#0F172A]">
                    {reviewActionLabel(entry.action)}
                  </span>
                  <span className="text-[#64748B]">
                    {entry.reviewerName ?? "—"}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-[#94A3B8]">
                    {formatDateTime(entry.reviewedAt)}
                  </span>
                </div>
                {entry.note && (
                  <p className="mt-1 whitespace-pre-wrap text-[#64748B]">
                    {entry.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
