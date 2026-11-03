"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useArchiveExamMutation,
  useDuplicateExamMutation,
  usePublishExamMutation,
} from "@/hooks/queries/use-exams";
import { useExamSessionsQuery } from "@/hooks/queries/use-exam-sessions";
import type { ExamSessionListItem, ExamSessionStatus } from "@/lib/api/exam-sessions";
import { Badge, Button, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { PublishedExamSummary, TeacherExamEditorResponse } from "@/lib/api/exams";
import type { NormalizedApiError } from "@/lib/api";
import { DraftEditor } from "./DraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";

export type ExamTab = "overview" | "questions" | "sessions";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "Not set";
  if (minutes === 0) return "Unlimited";
  return `${minutes} min`;
}

interface Notice {
  kind: "success" | "error" | "conflict";
  message: string;
}

/** Map a publish / duplicate / archive error. `conflict` signals a refetch-worthy 409. */
function describeActionError(err: unknown): { conflict?: boolean; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_PUBLISH_CONFLICT":
        return {
          conflict: true,
          message: "Publish conflict — the exam changed. Refreshed to the latest; review and retry.",
        };
      case "EXAM_ALREADY_PUBLISHED":
        return { conflict: true, message: "This exam is already published. Refreshed to the latest." };
      case "EXAM_NOT_DRAFT":
      case "EXAM_VERSION_NOT_DRAFT":
        return { conflict: true, message: "This exam is no longer a draft. Refreshed to the latest." };
      case "EXAM_ARCHIVE_CONFLICT":
        return {
          conflict: true,
          message: "Can't archive — close or cancel the scheduled/open sessions of this exam first.",
        };
      case "EXAM_ACCESS_DENIED":
        return { message: "You don't have permission for this action." };
      case "EXAM_VALIDATION_ERROR":
        return {
          message:
            norm.message ||
            "The exam isn't ready to publish — make sure each section has at least one question.",
        };
      default:
        return { message: norm.message || "Action failed. Please try again." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}

const NOTICE_STYLES: Record<Notice["kind"], string> = {
  success: "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]",
  conflict: "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#0F172A]",
  error: "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]",
};

function statusVariant(status: TeacherExamEditorResponse["status"]): "success" | "warn" | "default" {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "DRAFT":
      return "warn";
    default:
      return "default";
  }
}

function sessionStatusVariant(status: ExamSessionStatus): "success" | "accent" | "warn" | "default" {
  switch (status) {
    case "OPEN":
      return "success";
    case "SCHEDULED":
      return "accent";
    case "DRAFT":
      return "warn";
    default:
      return "default";
  }
}

const TABS: { id: ExamTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Questions" },
  { id: "sessions", label: "Sessions" },
];

/**
 * Top-level teacher exam management view (Phase 1, Task B — one exam = one
 * content set). Tabs: Overview (metadata + status actions), Questions (the
 * composition editor; read-only once published), Sessions (only this exam's
 * sessions).
 *
 * The answer-bearing snapshot rendered downstream is TEACHER-ONLY (never reused
 * for students).
 */
export function ExamEditor({
  data,
  tab,
  onTabChange,
}: {
  data: TeacherExamEditorResponse;
  tab: ExamTab;
  onTabChange: (tab: ExamTab) => void;
}) {
  const queryClient = useQueryClient();
  const publishMut = usePublishExamMutation(data.id);
  const duplicateMut = useDuplicateExamMutation(data.id);
  const archiveMut = useArchiveExamMutation(data.id);

  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const questionCount = data.composition.reduce((n, s) => n + s.questions.length, 0);
  // Publish needs at least one saved question in the composition.
  const canPublish =
    data.status === "DRAFT" && data.composition.some((s) => s.questions.length > 0);

  const onConfirmPublish = async () => {
    setConfirmPublish(false);
    setNotice(null);
    try {
      const res: PublishedExamSummary = await publishMut.mutateAsync({
        expectedExamVersion: data.examVersion,
      });
      setNotice({
        kind: "success",
        message: `Published (${res.questionCount ?? questionCount} questions, ${res.totalPoints} pts). Students can now be scheduled into sessions.`,
      });
      // mutation onSuccess already invalidated editor + list → refetch.
    } catch (err) {
      const mapped = describeActionError(err);
      setNotice({ kind: mapped.conflict ? "conflict" : "error", message: mapped.message });
      if (mapped.conflict) {
        // 409: refresh to the latest server state; do NOT auto-retry publish.
        queryClient.invalidateQueries({ queryKey: ["exams", data.id, "editor"] });
      }
    }
  };

  const onDuplicate = async () => {
    setNotice(null);
    try {
      const copy = await duplicateMut.mutateAsync();
      setNotice({
        kind: "success",
        message: `Duplicated as “${copy.title}” (${copy.code}) — a new draft you can edit freely.`,
      });
    } catch (err) {
      const mapped = describeActionError(err);
      setNotice({ kind: mapped.conflict ? "conflict" : "error", message: mapped.message });
    }
  };

  const onConfirmArchive = async () => {
    setConfirmArchive(false);
    setNotice(null);
    try {
      await archiveMut.mutateAsync();
      setNotice({ kind: "success", message: "Exam archived. It can no longer start new sessions." });
    } catch (err) {
      const mapped = describeActionError(err);
      setNotice({ kind: mapped.conflict ? "conflict" : "error", message: mapped.message });
      if (mapped.conflict) {
        queryClient.invalidateQueries({ queryKey: ["exams", data.id, "editor"] });
      }
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/exams"
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All exams
        </Link>
        <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          {data.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748B]">
          <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B]">
            {data.code}
          </span>
          {data.subject && <span>{data.subject.code} — {data.subject.name}</span>}
          {data.purpose && <span>· {data.purpose.title}</span>}
          <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-1" role="tablist" aria-label="Exam sections">
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(t.id)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] sm:flex-none sm:px-6",
                selected
                  ? "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                  : "text-[#64748B] hover:bg-white hover:text-[#0F172A]"
              )}
            >
              {t.label}
            </button>
          );
        })}
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

      {tab === "overview" && (
        <OverviewTab
          data={data}
          questionCount={questionCount}
          canPublish={canPublish}
          publishPending={publishMut.isPending}
          duplicatePending={duplicateMut.isPending}
          archivePending={archiveMut.isPending}
          onOpenPublish={() => {
            setNotice(null);
            setConfirmPublish(true);
          }}
          onDuplicate={onDuplicate}
          onOpenArchive={() => {
            setNotice(null);
            setConfirmArchive(true);
          }}
        />
      )}
      {tab === "questions" && (
        <DraftEditor exam={data} readOnly={data.status !== "DRAFT"} />
      )}
      {tab === "sessions" && <SessionsTab examId={data.id} published={data.status === "PUBLISHED"} />}

      {/* Publish confirmation — the snapshot is immutable, so confirm is required. */}
      <ConfirmDialog
        open={confirmPublish}
        titleId="publish-dialog-title"
        title={`Publish “${data.title}”?`}
        description="Publishing creates an immutable snapshot of this exam's content — it can no longer be edited. To change it afterwards, duplicate the exam and edit the copy."
        confirmLabel="Confirm publish"
        cancelLabel="Cancel"
        busyLabel="Publishing…"
        busy={publishMut.isPending}
        onConfirm={onConfirmPublish}
        onCancel={() => setConfirmPublish(false)}
      />

      {/* Archive confirmation. */}
      <ConfirmDialog
        open={confirmArchive}
        titleId="archive-dialog-title"
        title={`Archive “${data.title}”?`}
        description="Archived exams cannot start new sessions. Existing results are preserved."
        confirmLabel="Archive exam"
        cancelLabel="Cancel"
        busyLabel="Archiving…"
        busy={archiveMut.isPending}
        onConfirm={onConfirmArchive}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  );
}

function OverviewTab({
  data,
  questionCount,
  canPublish,
  publishPending,
  duplicatePending,
  archivePending,
  onOpenPublish,
  onDuplicate,
  onOpenArchive,
}: {
  data: TeacherExamEditorResponse;
  questionCount: number;
  canPublish: boolean;
  publishPending: boolean;
  duplicatePending: boolean;
  archivePending: boolean;
  onOpenPublish: () => void;
  onDuplicate: () => void;
  onOpenArchive: () => void;
}) {
  const facts: { label: string; value: string }[] = [
    { label: "Status", value: data.status },
    { label: "Code", value: data.code },
    { label: "Subject", value: data.subject ? `${data.subject.code} — ${data.subject.name}` : "—" },
    { label: "Purpose", value: data.purpose ? data.purpose.title : "—" },
    { label: "Questions", value: String(questionCount) },
    { label: "Total points", value: String(data.totalPoints) },
    { label: "Duration", value: formatDuration(data.durationMinutes) },
    { label: "Published at", value: formatDate(data.publishedAt) },
    { label: "Created", value: formatDate(data.createdAt) },
    { label: "Updated", value: formatDate(data.updatedAt) },
  ];

  return (
    <div className="space-y-6">
      {data.status === "ARCHIVED" && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <span>
            This exam is archived — no new sessions can be created from it. Duplicate it to reuse its content.
          </span>
        </div>
      )}

      {/* Status actions */}
      <div className={cn(cardVariants(), "flex flex-wrap items-center gap-3 p-4")}>
        {data.status === "DRAFT" && (
          <>
            <Button type="button" onClick={onOpenPublish} disabled={!canPublish || publishPending}>
              {publishPending ? "Publishing…" : "Publish exam"}
            </Button>
            {!canPublish && (
              <span className="text-xs font-medium text-[#64748B]">
                Save at least one question before publishing.
              </span>
            )}
          </>
        )}
        {data.status === "PUBLISHED" && (
          <>
            <Button type="button" variant="outline" onClick={onDuplicate} disabled={duplicatePending}>
              {duplicatePending ? "Duplicating…" : "Duplicate"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onOpenArchive}
              disabled={archivePending}
              className="text-[#EF4444] hover:bg-[#EF4444]/5"
            >
              {archivePending ? "Archiving…" : "Archive"}
            </Button>
            <span className="text-xs font-medium text-[#64748B]">
              Published content is immutable — duplicate to change it.
            </span>
          </>
        )}
        {data.status === "ARCHIVED" && (
          <Button type="button" variant="outline" onClick={onDuplicate} disabled={duplicatePending}>
            {duplicatePending ? "Duplicating…" : "Duplicate"}
          </Button>
        )}
      </div>

      {/* Metadata */}
      <div className={cn(cardVariants(), "p-6")}>
        <h2 className="mb-4 font-display text-lg font-bold tracking-tight text-[#0F172A]">Details</h2>
        {data.description && (
          <p className="mb-4 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-sm leading-relaxed text-[#0F172A]">
            {data.description}
          </p>
        )}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((r) => (
            <div key={r.label} className="flex flex-col">
              <dt className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">{r.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-[#0F172A]">{r.value}</dd>
            </div>
          ))}
        </dl>
        {data.instructions && (
          <div className="mt-6">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Instructions</p>
            <p className="mt-1 whitespace-pre-line rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-sm leading-relaxed text-[#0F172A]">
              {data.instructions}
            </p>
          </div>
        )}
        {data.sourceExamId && (
          <p className="mt-6 text-xs font-medium text-[#64748B]">
            Duplicated from{" "}
            <Link
              href={`/exams/${data.sourceExamId}`}
              className="rounded font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
            >
              exam #{data.sourceExamId}
            </Link>
          </p>
        )}
      </div>

      {/* tfMatrixScoring — read-only */}
      <details className={cn(cardVariants(), "p-4")}>
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          True/False matrix scoring (read-only)
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-[#F1F5F9] p-3 text-xs text-[#0F172A]">
          {JSON.stringify(data.tfMatrixScoring ?? null, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SessionsTab({ examId, published }: { examId: number; published: boolean }) {
  const { data, isPending, isError } = useExamSessionsQuery(examId, {
    size: 50,
    sort: "createdAt,desc",
  });
  const items: ExamSessionListItem[] = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#64748B]">
          Sessions of this exam ({data?.totalElements ?? (isPending ? "…" : 0)})
        </p>
        {published ? (
          <Link
            href={`/exams/${examId}/sessions/new`}
            className={cn(buttonVariants({ variant: "primary" }), "gap-1.5")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New session
          </Link>
        ) : (
          <span className="text-xs font-medium text-[#64748B]">
            Publish the exam to create sessions.
          </span>
        )}
      </div>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <div role="status" aria-busy="true" aria-label="Loading sessions" className="space-y-3 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[#F1F5F9]" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : isError ? (
          <p role="alert" className="p-4 text-sm font-medium text-[#EF4444]">
            Couldn&apos;t load sessions. Please try again.
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#64748B]">
            No sessions yet{published ? " — create the first one." : "."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
                  <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Title</th>
                  <th scope="col" className="px-3 pb-3 text-center font-semibold">Status</th>
                  <th scope="col" className="px-3 pb-3 text-center font-semibold">Starts at</th>
                  <th scope="col" className="px-3 pb-3 text-center font-semibold">Ends at</th>
                  <th scope="col" className="px-3 pb-3 text-center font-semibold">Part.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr
                    key={s.id}
                    className="relative border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]"
                  >
                    <td className="px-3 py-3">
                      <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs whitespace-nowrap text-[#64748B] transition-colors group-hover:text-[#0052FF]">
                        {s.code}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold transition-colors group-hover:text-[#0052FF]">
                      <Link
                        href={`/exams/${examId}/sessions/${s.id}`}
                        className="after:absolute after:inset-0 rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                      >
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant={sessionStatusVariant(s.status)}>{s.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-center text-[#64748B]">{formatDate(s.startsAt)}</td>
                    <td className="px-3 py-3 text-center text-[#64748B]">{formatDate(s.endsAt)}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-[#64748B]">{s.participantCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
