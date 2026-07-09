"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateNextDraftMutation,
  usePublishExamMutation,
} from "@/hooks/queries/use-exams";
import { Badge, Button, SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type {
  PublishedExamSummary,
  TeacherExamEditorResponse,
} from "@/lib/api/exams";
import type { NormalizedApiError } from "@/lib/api";
import { DraftEditor } from "./DraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";

function formatDate(iso: string): string {
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

interface Notice {
  kind: "success" | "error" | "conflict";
  message: string;
}

/** Map a publish / create-draft error. `conflict` signals a refetch-worthy 409. */
function describeActionError(err: unknown): { conflict?: boolean; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_PUBLISH_CONFLICT":
        return {
          conflict: true,
          message: "Publish conflict — the draft changed. Refreshed to the latest; review and retry.",
        };
      case "EXAM_VERSION_NOT_DRAFT":
        return { conflict: true, message: "This version is no longer a draft. Refreshed to the latest." };
      case "EXAM_VERSION_NOT_FOUND":
        return { conflict: true, message: "The version to clone could not be found." };
      case "EXAM_ACCESS_DENIED":
        return { message: "You don't have permission for this action." };
      case "EXAM_VALIDATION_ERROR":
        return {
          message:
            norm.message ||
            "The draft isn't ready to publish — make sure each section has at least one question.",
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

/**
 * Top-level teacher exam editor. Renders exam metadata, the read-only
 * tfMatrixScoring, the published-version history, and — when a draft exists —
 * the editable <DraftEditor>, plus Publish / Create-new-draft actions (FE7c).
 *
 * The answer-bearing snapshot rendered downstream is TEACHER-ONLY (never reused
 * for students).
 */
export function ExamEditor({ data }: { data: TeacherExamEditorResponse }) {
  const queryClient = useQueryClient();
  const publishMut = usePublishExamMutation(data.id);
  const createDraftMut = useCreateNextDraftMutation(data.id);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const draft = data.currentDraftVersion;
  const hasPublished = data.publishedVersions.length > 0;
  // Publish needs at least one saved question in the draft.
  const canPublish = !!draft && draft.sections.some((s) => s.questions.length > 0);

  const onConfirmPublish = async () => {
    setConfirmOpen(false);
    if (!draft) return;
    setNotice(null);
    try {
      const res: PublishedExamSummary = await publishMut.mutateAsync({
        expectedVersionNumber: draft.versionNumber,
      });
      setNotice({
        kind: "success",
        message: `Published v${res.versionNumber} (${res.questionCount ?? 0} questions, ${res.totalPoints} pts).`,
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

  const onCreateDraft = async () => {
    setNotice(null);
    try {
      const res = await createDraftMut.mutateAsync({}); // cloneFromVersionNumber null = latest PUBLISHED
      setNotice({
        kind: "success",
        message: `New draft v${res.versionNumber} created from v${res.clonedFrom ?? "?"}.`,
      });
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
        <SectionLabel className="mb-3 mt-3">Exam editor</SectionLabel>
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          {data.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748B]">
          <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[#64748B]">
            {data.code}
          </span>
          <span>{data.subject.code} — {data.subject.name}</span>
          {data.purpose && <span>· {data.purpose.title}</span>}
          <Badge variant={data.status === "READY" ? "success" : "default"}>
            {data.status}
          </Badge>
          <span className="text-xs">v{data.currentVersionNumber ?? "—"}</span>
        </div>
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

      {/* Publish action — only when a draft exists. */}
      {draft && (
        <div className={cn(cardVariants(), "mb-6 flex flex-wrap items-center gap-3 p-4")}>
          <Button
            type="button"
            onClick={() => {
              setNotice(null);
              setConfirmOpen(true);
            }}
            disabled={!canPublish || publishMut.isPending}
          >
            {publishMut.isPending ? "Publishing…" : "Publish draft"}
          </Button>
          {!canPublish && (
            <span className="text-xs font-medium text-[#64748B]">
              Save at least one question before publishing.
            </span>
          )}
        </div>
      )}

      {/* tfMatrixScoring — read-only */}
      <details className={cn(cardVariants(), "mb-6 p-4")}>
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          True/False matrix scoring (read-only)
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-[#F1F5F9] p-3 text-xs text-[#0F172A]">
          {JSON.stringify(data.currentDraftVersion?.tfMatrixScoring ?? null, null, 2)}
        </pre>
      </details>

      {/* Published versions — read-only */}
      <div className={cn(cardVariants(), "mb-6 p-5")}>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          Published versions ({data.publishedVersions.length})
        </h2>
        {data.publishedVersions.length === 0 ? (
          <p className="text-sm text-[#64748B]">No published versions yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.publishedVersions.map((v) => (
              <li
                key={v.versionNumber}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2 text-sm"
              >
                <span className="font-semibold text-[#0F172A]">v{v.versionNumber}</span>
                <span className="text-[#64748B]">published {formatDate(v.publishedAt)}</span>
                <span className="text-[#64748B]">· {v.totalPoints} points</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Draft editor — or no-draft block (with optional create-draft action). */}
      {draft ? (
        <DraftEditor examId={data.id} draft={draft} />
      ) : (
        <div className={cn(cardVariants(), "p-8 text-center")}>
          <p className="font-display text-lg font-bold text-[#0F172A]">No active draft</p>
          <p className="mt-1 text-sm text-[#64748B]">
            {hasPublished
              ? "Create a new draft to edit — it clones the latest published version."
              : "A draft is needed before you can publish."}
          </p>
          {hasPublished && (
            <Button
              type="button"
              onClick={onCreateDraft}
              disabled={createDraftMut.isPending}
              className="mt-5"
            >
              {createDraftMut.isPending ? "Creating…" : "Create new draft"}
            </Button>
          )}
        </div>
      )}

      {/* Publish confirmation — snapshot is immutable, so confirm is required. */}
      <ConfirmDialog
        open={confirmOpen}
        titleId="publish-dialog-title"
        title={`Publish version ${draft?.versionNumber ?? ""}?`}
        description="This creates an immutable snapshot. To edit further afterwards, you'll create a new draft from this published version."
        confirmLabel="Confirm publish"
        cancelLabel="Cancel"
        busyLabel="Publishing…"
        busy={publishMut.isPending}
        onConfirm={onConfirmPublish}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
