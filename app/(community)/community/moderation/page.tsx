"use client";

import { useState } from "react";
import {
  useDismissReportMutation,
  useHidePublicationMutation,
  useModerationGrantQuery,
  useModerationReportsQuery,
  usePublicationHistoryQuery,
  useResolveReportMutation,
  useRestorePublicationMutation,
} from "@/hooks/queries/use-community-owner";
import {
  DEFAULT_MODERATION_PAGE_SIZE,
  type CommunityReportReasonCode,
  type CommunityReportStatus,
  type ModerationAuditAction,
  type ModerationReportItem,
} from "@/lib/api/community-owner";
import type { NormalizedApiError } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { SegmentedControl } from "@/components/ui";
import { describeCommunityError } from "@/components/community/community-errors";
import { ModerationActionDialog } from "@/components/community/ModerationActionDialog";
import { CommunityDialog } from "@/components/community/CommunityDialog";
/**
 *
 * Explicit gate: the grant query (`GET /api/community/moderation/grant`) —
 * 200 `{granted:true}` renders the console; API errors (the 403 denial et
 * al.) render the "not a moderator" state, while non-API failures
 * (network/unknown) render a retryable error instead — in both cases the
 * queue is never fetched. Queue actions:
 * hide/restore (reason mandatory), dismiss/resolve (note optional), plus the
 * append-only per-publication audit history rendered newest-first.
 *
 * Queue items expose internal user ids nowhere except the audit history's
 * actor column (§5 audited privilege); no username/email/phone ever renders.
 */

const STATUS_OPTIONS = [
  { label: "Open", value: "OPEN" },
  { label: "Dismissed", value: "DISMISSED" },
  { label: "Resolved", value: "RESOLVED" },
] as const satisfies readonly { label: string; value: CommunityReportStatus }[];

const REASON_LABELS: Record<CommunityReportReasonCode, string> = {
  INAPPROPRIATE_CONTENT: "Inappropriate content",
  COPYRIGHT: "Copyright",
  MISLEADING: "Misleading",
  SPAM: "Spam",
  OTHER: "Other",
};

const REASON_VARIANTS: Record<CommunityReportReasonCode, "destructive" | "warn" | "default"> = {
  INAPPROPRIATE_CONTENT: "destructive",
  COPYRIGHT: "warn",
  MISLEADING: "warn",
  SPAM: "warn",
  OTHER: "default",
};

const ACTION_LABELS: Record<ModerationAuditAction, string> = {
  HIDE: "Hide",
  RESTORE: "Restore",
  REPORT_DISMISS: "Dismiss report",
  REPORT_RESOLVE: "Resolve report",
};

type PendingAction =
  | { kind: "hide"; publicationId: number; title: string }
  | { kind: "restore"; publicationId: number; title: string }
  | { kind: "dismiss"; reportId: number; title: string }
  | { kind: "resolve"; reportId: number; title: string };

interface Notice {
  kind: "success" | "error";
  message: string;
}

const NOTICE_STYLES: Record<Notice["kind"], string> = {
  success: "border-[#10B981]/30 bg-[#10B981]/5 text-[#0F172A]",
  error: "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Queue fallback — a null/odd embedded summary degrades to the id, never a crash. */
function publicationTitle(report: ModerationReportItem): string {
  return report.publication?.title ?? `Publication #${report.publicationId}`;
}

export default function CommunityModerationPage() {
  const grant = useModerationGrantQuery();
  const granted = grant.data?.granted === true;

  const [status, setStatus] = useState<CommunityReportStatus>("OPEN");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [history, setHistory] = useState<{ publicationId: number; title: string } | null>(null);

  const reports = useModerationReportsQuery(
    { status, page, size: DEFAULT_MODERATION_PAGE_SIZE },
    granted
  );

  const hideMut = useHidePublicationMutation();
  const restoreMut = useRestorePublicationMutation();
  const dismissMut = useDismissReportMutation();
  const resolveMut = useResolveReportMutation();

  const runAction = async (action: PendingAction, value: string | undefined) => {
    setNotice(null);
    try {
      if (action.kind === "hide") {
        await hideMut.mutateAsync({ publicationId: action.publicationId, reason: value ?? "" });
        setNotice({ kind: "success", message: `“${action.title}” was hidden from the community.` });
      } else if (action.kind === "restore") {
        await restoreMut.mutateAsync({ publicationId: action.publicationId, reason: value ?? "" });
        setNotice({ kind: "success", message: `“${action.title}” was restored to the community.` });
      } else if (action.kind === "dismiss") {
        await dismissMut.mutateAsync({ reportId: action.reportId, note: value });
        setNotice({ kind: "success", message: "Report dismissed." });
      } else {
        await resolveMut.mutateAsync({ reportId: action.reportId, note: value });
        setNotice({ kind: "success", message: "Report resolved." });
      }
    } catch (err) {
      setNotice({ kind: "error", message: describeCommunityError(err).message });
    } finally {
      setPending(null);
    }
  };

  if (grant.isPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Checking moderator access"
        className="flex min-h-[40vh] items-center justify-center"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0052FF]" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  // Non-API failures (network/unknown) are transient, not a denial — offer a
  // retry instead of the "not a moderator" copy.
  const grantError = grant.error as unknown as NormalizedApiError | undefined;
  if (grant.isError && grantError?.kind !== "api") {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A]">
          Community moderation
        </h1>
        <p role="alert" className="mt-3 text-sm font-medium text-[#EF4444]">
          {grantError?.kind === "network"
            ? "Network error — check your connection and try again."
            : "Couldn't verify moderator access. Please try again."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-6 h-11"
          onClick={() => grant.refetch()}
        >
          Try again
        </Button>
      </Card>
    );
  }

  // 403 (no grant) — or any other API error — never renders the console. The
  // queue query stays disabled (`granted === false`), so nothing is fetched.
  if (!granted) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A]">
          Community moderation
        </h1>
        <p className="mt-3 text-sm font-medium text-[#64748B]">
          You are not a community moderator. Moderator access is provisioned by
          Quizopia operators and can be revoked at any time.
        </p>
      </Card>
    );
  }

  const items = reports.data?.items ?? [];
  const totalPages = reports.data?.totalPages ?? 0;
  const totalElements = reports.data?.totalElements ?? 0;
  const busyAction =
    pending !== null &&
    (hideMut.isPending || restoreMut.isPending || dismissMut.isPending || resolveMut.isPending);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Community <span className="gradient-text">moderation</span>
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Review reports, hide or restore publications, and consult the
          append-only action history. Every action is audited with your reason.
        </p>
      </div>

      {notice && (
        <div
          role={notice.kind === "success" ? "status" : "alert"}
          className={cn(
            "mb-6 flex items-start gap-2 rounded-lg border p-4 text-sm font-medium",
            NOTICE_STYLES[notice.kind]
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <span>{notice.message}</span>
        </div>
      )}

      <SegmentedControl
        aria-label="Filter reports by status"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPage(0);
        }}
      />

      <section
        aria-label="Report queue"
        aria-busy={reports.isPending || reports.isPlaceholderData}
      >
        {reports.isPending ? (
          <QueueSkeleton />
        ) : reports.isError ? (
          <QueueError error={reports.error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <Card className="p-10 text-center">
            <h2 className="font-display text-xl tracking-tight text-[#0F172A]">
              No {status.toLowerCase()} reports
            </h2>
            <p className="mt-2 text-sm font-medium text-[#64748B]">
              {status === "OPEN"
                ? "The queue is clear — new reports will appear here."
                : "Switch tabs to see reports in another state."}
            </p>
          </Card>
        ) : (
          <>
            <div className="adaptive-grid adaptive-grid--wide">
              {items.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onHide={() =>
                    setPending({
                      kind: "hide",
                      publicationId: report.publicationId,
                      title: publicationTitle(report),
                    })
                  }
                  onRestore={() =>
                    setPending({
                      kind: "restore",
                      publicationId: report.publicationId,
                      title: publicationTitle(report),
                    })
                  }
                  onDismiss={() =>
                    setPending({ kind: "dismiss", reportId: report.id, title: publicationTitle(report) })
                  }
                  onResolve={() =>
                    setPending({ kind: "resolve", reportId: report.id, title: publicationTitle(report) })
                  }
                  onHistory={() =>
                    setHistory({
                      publicationId: report.publicationId,
                      title: publicationTitle(report),
                    })
                  }
                />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} totalElements={totalElements} onPage={setPage} />
          </>
        )}
      </section>

      {pending && (
        <ModerationActionDialog
          open
          titleId="moderation-action-title"
          title={pendingTitle(pending)}
          description={pendingDescription(pending)}
          mode={pending.kind === "hide" || pending.kind === "restore" ? "reason" : "note"}
          confirmLabel={pendingLabel(pending)}
          busy={busyAction}
          onSubmit={(value) => runAction(pending, value)}
          onCancel={() => setPending(null)}
        />
      )}

      {history && (
        <HistoryDialog
          publicationId={history.publicationId}
          title={history.title}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}

function pendingTitle(action: PendingAction): string {
  switch (action.kind) {
    case "hide":
      return "Hide publication";
    case "restore":
      return "Restore publication";
    case "dismiss":
      return "Dismiss report";
    case "resolve":
      return "Resolve report";
  }
}

function pendingLabel(action: PendingAction): string {
  switch (action.kind) {
    case "hide":
      return "Hide from community";
    case "restore":
      return "Restore to community";
    case "dismiss":
      return "Dismiss report";
    case "resolve":
      return "Resolve report";
  }
}

function pendingDescription(action: PendingAction): string {
  switch (action.kind) {
    case "hide":
      return `“${action.title}” disappears from the public catalog until a moderator restores it. The owner keeps their data.`;
    case "restore":
      return `“${action.title}” becomes publicly visible again (it stays unpublished if the owner unpublished it).`;
    case "dismiss":
      return "Mark this report as dismissed — no action on the publication.";
    case "resolve":
      return "Mark this report as resolved — typically after handling the publication.";
  }
}

function ReportCard({
  report,
  onHide,
  onRestore,
  onDismiss,
  onResolve,
  onHistory,
}: {
  report: ModerationReportItem;
  onHide: () => void;
  onRestore: () => void;
  onDismiss: () => void;
  onResolve: () => void;
  onHistory: () => void;
}) {
  const pub = report.publication;
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={REASON_VARIANTS[report.reasonCode]}>
          {REASON_LABELS[report.reasonCode]}
        </Badge>
        <Badge variant={report.status === "OPEN" ? "accent" : report.status === "RESOLVED" ? "success" : "default"}>
          {report.status}
        </Badge>
        <span className="text-xs font-medium text-[#64748B]">
          Reported {formatDateTime(report.createdAt)} · report #{report.id}
        </span>
      </div>

      {report.details && (
        <p className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-sm leading-relaxed text-[#0F172A]">
          {report.details}
        </p>
      )}

      <div className="mt-4 rounded-lg border border-[#E2E8F0] p-4">
        <p className="text-sm font-semibold text-[#0F172A]">{publicationTitle(report)}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          by <span className="normal-case text-[#0F172A]">{pub?.authorName ?? "—"}</span>
          {pub?.categoryTitle ? ` · ${pub.categoryTitle}` : ""} · {pub?.questionCount ?? 0} question
          {pub?.questionCount === 1 ? "" : "s"} · {pub?.sectionCount ?? 0} section
          {pub?.sectionCount === 1 ? "" : "s"} · {pub?.durationMinutes ?? 0} min · publication #
          {report.publicationId}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="destructive" size="sm" className="h-11" onClick={onHide}>
          Hide
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-11" onClick={onRestore}>
          Restore
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-11" onClick={onHistory}>
          History
        </Button>
        {report.status === "OPEN" && (
          <>
            <Button type="button" variant="outline" size="sm" className="h-11" onClick={onDismiss}>
              Dismiss report
            </Button>
            <Button type="button" size="sm" className="h-11" onClick={onResolve}>
              Resolve report
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function HistoryDialog({
  publicationId,
  title,
  onClose,
}: {
  publicationId: number;
  title: string;
  onClose: () => void;
}) {
  const { data, isPending, isError } = usePublicationHistoryQuery(publicationId, true);
  // Append-only display: newest first (id = insert order), never editable.
  const entries = [...(data ?? [])].sort((a, b) => b.id - a.id);

  return (
    <CommunityDialog
      open
      titleId="publication-history-title"
      title="Moderation history"
      description={`Append-only audit for “${title}” (publication #${publicationId}).`}
      onCancel={onClose}
      size="lg"
    >
      {isPending ? (
        <p role="status" aria-busy="true" className="py-6 text-center text-sm font-medium text-[#64748B]">
          Loading history…
        </p>
      ) : isError ? (
        <p role="alert" className="py-6 text-center text-sm font-medium text-[#EF4444]">
          Couldn&apos;t load the moderation history. Please try again.
        </p>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm font-medium text-[#64748B]">
          No moderation actions recorded for this publication yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">
              Moderation actions for publication #{publicationId}, newest first
            </caption>
            <thead>
              <tr className="border-b border-[#E2E8F0] font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
                <th scope="col" className="py-2 pr-4">When</th>
                <th scope="col" className="py-2 pr-4">Action</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Moderation</th>
                <th scope="col" className="py-2 pr-4">Reason</th>
                <th scope="col" className="py-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[#E2E8F0] align-top">
                  <td className="py-3 pr-4 text-xs font-medium text-[#64748B]">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-[#0F172A]">
                    {ACTION_LABELS[entry.action]}
                  </td>
                  <td className="py-3 pr-4 text-xs text-[#64748B]">
                    {formatTransition(entry.fromStatus, entry.toStatus)}
                  </td>
                  <td className="py-3 pr-4 text-xs text-[#64748B]">
                    {formatTransition(entry.fromModerationState, entry.toModerationState)}
                  </td>
                  <td className="py-3 pr-4 max-w-[220px] text-[#0F172A]">{entry.reason}</td>
                  <td className="py-3 text-xs font-medium text-[#64748B]">#{entry.actorUserId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </CommunityDialog>
  );
}

function formatTransition(from: string | null, to: string | null): string {
  if (from === null && to === null) return "—";
  if (from === null) return `→ ${to}`;
  if (to === null) return from;
  return from === to ? from : `${from} → ${to}`;
}

function Pagination({
  page,
  totalPages,
  totalElements,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalElements: number;
  onPage: (page: number) => void;
}) {
  const pageBtnClass =
    "inline-flex h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <nav
      aria-label="Report queue pagination"
      className="mt-6 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        Page {page + 1} of {Math.max(1, totalPages)} · {totalElements} report
        {totalElements === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={pageBtnClass}
          onClick={() => onPage(page - 1)}
          disabled={page <= 0}
        >
          Previous page
        </button>
        <button
          type="button"
          className={pageBtnClass}
          onClick={() => onPage(page + 1)}
          disabled={page + 1 >= totalPages}
        >
          Next page
        </button>
      </div>
    </nav>
  );
}

function QueueSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading reports" className="adaptive-grid adaptive-grid--wide">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]"
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function QueueError({ error }: { error: NormalizedApiError | undefined }) {
  const message =
    error?.kind === "network"
      ? "Network error — check your connection and try again."
      : "Couldn't load the report queue. Please try again.";
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}
