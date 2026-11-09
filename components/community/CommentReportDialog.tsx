"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { ReportCommentMutation } from "@/hooks/queries/use-community-comments";
import { CommunityDialog } from "./CommunityDialog";
import { describeCommentError } from "./community-errors";
import {
  COMMENT_REPORT_REASONS,
  type CommentReportReason,
} from "@/lib/api/community-comments";
import { COMMUNITY_COMMENT_REPORT_DETAILS_MAX } from "@/lib/validation/community-schemas";

/**
 * Report-comment dialog (P3-C4, issue #68 — ADR-007 §5). One §3 reason code
 * (select) + optional free-text details (≤500), inside the shared
 * `CommunityDialog` shell (role=dialog, focus trap, busy-suppressed cancel).
 *
 * The mutation itself lives on the parent list item so its success state
 * survives this dialog unmounting ("Report sent" replaces the item's Report
 * action). §5: 201 first report, 200 idempotent dedupe — either way the
 * outcome copy is the same.
 */

/** §3 reason codes with human labels (same catalog as publication reports). */
const REASON_LABELS: Record<CommentReportReason, string> = {
  INAPPROPRIATE_CONTENT: "Inappropriate content",
  COPYRIGHT: "Copyright violation",
  MISLEADING: "Misleading",
  SPAM: "Spam",
  OTHER: "Other",
};

type ReportMutation = ReportCommentMutation;

export function CommentReportDialog({
  commentId,
  reportMut,
  onClose,
}: {
  commentId: number;
  /** Parent-owned `useReportCommentMutation` (success outlives the dialog). */
  reportMut: ReportMutation;
  onClose: () => void;
}) {
  // Fresh every open — the parent mounts this dialog on demand.
  const [reasonCode, setReasonCode] = useState("");
  const [details, setDetails] = useState("");
  const detailsOver = details.length > COMMUNITY_COMMENT_REPORT_DETAILS_MAX;
  const canSubmit = reasonCode !== "" && !detailsOver && !reportMut.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    reportMut.mutate({
      commentId,
      reasonCode: reasonCode as CommentReportReason,
      details: details.trim() === "" ? undefined : details,
    });
  };

  return (
    <CommunityDialog
      open
      titleId="report-comment-title"
      title="Report comment"
      description="Tell our moderators why this comment breaks the rules."
      onCancel={onClose}
      busy={reportMut.isPending}
    >
      <form
        aria-label="Report comment"
        data-testid="comment-report-form"
        onSubmit={onSubmit}
        className="space-y-3"
      >
        <div className="space-y-1">
          <label
            htmlFor="report-reason"
            className="block text-xs font-semibold uppercase tracking-wide text-[#64748B]"
          >
            Reason
          </label>
          <select
            id="report-reason"
            data-autofocus
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
          >
            <option value="">Choose a reason…</option>
            {COMMENT_REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="report-details"
            className="block text-xs font-semibold uppercase tracking-wide text-[#64748B]"
          >
            Details (optional)
          </label>
          <textarea
            id="report-details"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Anything that helps the moderators"
            className="w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm leading-relaxed text-[#0F172A] outline-none transition-all duration-200 placeholder:text-[#64748B]/50 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
          />
          <p
            data-testid="report-details-count"
            className={cn(
              "mt-1 text-right text-xs font-medium",
              detailsOver ? "text-[#EF4444]" : "text-[#64748B]"
            )}
          >
            {details.length}/{COMMUNITY_COMMENT_REPORT_DETAILS_MAX}
            {detailsOver
              ? ` — details must be ${COMMUNITY_COMMENT_REPORT_DETAILS_MAX} characters or fewer.`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11" disabled={!canSubmit}>
            {reportMut.isPending ? "Sending…" : "Submit report"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={onClose}
            disabled={reportMut.isPending}
          >
            Cancel
          </Button>
        </div>

        {reportMut.isSuccess && (
          <p role="status" className="text-sm font-medium text-[#10B981]">
            Report sent — our moderators will review it.
          </p>
        )}
        {reportMut.error && (
          <p role="alert" className="text-sm font-medium text-[#EF4444]">
            {describeCommentError(reportMut.error, "comment")}
          </p>
        )}
      </form>
    </CommunityDialog>
  );
}
