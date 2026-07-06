"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateNextDraftMutation,
  usePublishExamMutation,
} from "@/hooks/queries/use-exams";
import type {
  PublishedExamSummary,
  TeacherExamEditorResponse,
} from "@/lib/api/exams";
import type { NormalizedApiError } from "@/lib/api";
import { DraftEditor } from "./DraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";

const primaryBtn =
  "neumorphic-active-press inline-flex h-11 items-center justify-center rounded-button bg-[#6C63FF] px-6 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";

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
          className="inline-flex items-center gap-1.5 rounded-inner text-xs font-semibold uppercase tracking-wider text-[#6B7280] outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
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
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
          {data.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#6B7280]">
          <span className="rounded-inner bg-[#E0E5EC] px-2 py-0.5 font-mono text-xs shadow-inset-small">
            {data.code}
          </span>
          <span>{data.subject.code} — {data.subject.name}</span>
          {data.purpose && <span>· {data.purpose.title}</span>}
          <span
            className={`rounded-inner bg-[#E0E5EC] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-inset-small ${
              data.status === "READY" ? "text-[#38B2AC]" : "text-[#6B7280]"
            }`}
          >
            {data.status}
          </span>
          <span className="text-xs">v{data.currentVersionNumber ?? "—"}</span>
        </div>
      </div>

      {notice && (
        <div
          role={notice.kind === "success" ? "status" : "alert"}
          className={`mb-6 flex items-start gap-2 rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium shadow-inset-deep ${
            notice.kind === "success" ? "text-[#38B2AC]" : "text-[#3D4852]"
          }`}
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
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-container bg-[#E0E5EC] p-4 shadow-extruded">
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setConfirmOpen(true);
            }}
            disabled={!canPublish || publishMut.isPending}
            className={primaryBtn}
          >
            {publishMut.isPending ? "Publishing…" : "Publish draft"}
          </button>
          {!canPublish && (
            <span className="text-xs font-medium text-[#6B7280]">
              Save at least one question before publishing.
            </span>
          )}
        </div>
      )}

      {/* tfMatrixScoring — read-only */}
      <details className="mb-6 rounded-container bg-[#E0E5EC] p-4 shadow-extruded">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          True/False matrix scoring (read-only)
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-[#E0E5EC] p-3 text-xs text-[#3D4852] shadow-inset-pressed">
          {JSON.stringify(data.currentDraftVersion?.tfMatrixScoring ?? null, null, 2)}
        </pre>
      </details>

      {/* Published versions — read-only */}
      <div className="mb-6 rounded-container bg-[#E0E5EC] p-5 shadow-extruded">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          Published versions ({data.publishedVersions.length})
        </h2>
        {data.publishedVersions.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No published versions yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.publishedVersions.map((v) => (
              <li
                key={v.versionNumber}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[#E0E5EC] px-3 py-2 text-sm shadow-inset-small"
              >
                <span className="font-semibold text-[#3D4852]">v{v.versionNumber}</span>
                <span className="text-[#6B7280]">published {formatDate(v.publishedAt)}</span>
                <span className="text-[#6B7280]">· {v.totalPoints} points</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Draft editor — or no-draft block (with optional create-draft action). */}
      {draft ? (
        <DraftEditor examId={data.id} draft={draft} />
      ) : (
        <div className="rounded-container bg-[#E0E5EC] p-8 text-center shadow-extruded">
          <p className="font-display text-lg font-bold text-[#3D4852]">No active draft</p>
          <p className="mt-1 text-sm text-[#6B7280]">
            {hasPublished
              ? "Create a new draft to edit — it clones the latest published version."
              : "A draft is needed before you can publish."}
          </p>
          {hasPublished && (
            <button
              type="button"
              onClick={onCreateDraft}
              disabled={createDraftMut.isPending}
              className={`mt-5 ${primaryBtn}`}
            >
              {createDraftMut.isPending ? "Creating…" : "Create new draft"}
            </button>
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
