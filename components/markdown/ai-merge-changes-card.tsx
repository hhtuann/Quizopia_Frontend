"use client";

import { useState } from "react";
import type { QuestionPreservation } from "@/lib/quiz-markdown/question-preservation";
import { cn } from "@/lib/utils/cn";
import type { AiAuthorDiagnostic } from "@/lib/api/ai-authoring";

/** Lifecycle of one AI change set inside the conversation. */
export type AiMergeStatus =
  | "pending"
  | "kept"
  | "undone"
  | "conflict"
  | "invalid"
  | "destructive";

/**
 * Prism-style compact Merge Changes card (Quizopia_System #121, UX-04).
 *
 * Rendered per AI turn inside the conversation: brief state line, honest
 * `+added/-deleted` diff-line counts (computed by the parent from the real
 * before/after snapshots, never hardcoded), and Review / Undo all / Keep all
 * actions.
 *
 * The card is PRESENTATIONAL: the parent owns the editor and the change-set
 * state machine; callbacks receive the change set id so multiple turns never
 * cross-apply. When `manualEditsAfterApply` is set, Undo all demands an
 * explicit destructive-restore confirmation instead of silently discarding
 * the teacher's edits.
 */
export function AiMergeChangesCard({
  changeSetId,
  counts,
  diagnostics,
  invalid,
  manualEditsAfterApply,
  onKeepAll,
  onReview,
  onUndoAll,
  preservation,
  status,
}: {
  readonly changeSetId: string;
  /** Honest diff-line counts computed by the parent from the real snapshots. */
  readonly counts: { readonly added: number; readonly deleted: number };
  readonly diagnostics: readonly AiAuthorDiagnostic[];
  readonly invalid: boolean;
  readonly onKeepAll: (changeSetId: string) => void;
  readonly onReview: (changeSetId: string) => void;
  readonly onUndoAll: (changeSetId: string) => void;
  /** Question-preservation assessment (UX-06); drives the destructive state. */
  readonly preservation: QuestionPreservation;
  readonly status: AiMergeStatus;
  /** Manual edits happened after the pending apply — Undo needs confirmation. */
  readonly manualEditsAfterApply: boolean;
}) {
  const [confirmingUndo, setConfirmingUndo] = useState(false);

  const handleUndoClick = () => {
    if (manualEditsAfterApply) {
      setConfirmingUndo(true);
      return;
    }
    onUndoAll(changeSetId);
  };

  return (
    <article
      aria-label="AI merge changes"
      className={cn(
        "rounded-xl border p-3",
        status === "kept" && "border-[#10B981]/30 bg-[#10B981]/5",
        status === "undone" && "border-[#E2E8F0] bg-[#F8FAFC] opacity-75",
        status === "invalid" && "border-[#EF4444]/30 bg-[#EF4444]/5",
        status === "destructive" && "border-[#EF4444]/30 bg-[#EF4444]/5",
        (status === "pending" || status === "conflict") && "border-[#E2E8F0] bg-white",
      )}
      data-change-set={changeSetId}
      data-testid="ai-merge-changes-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold text-[#0F172A]">
          {invalid ? "Candidate needs fixes" : "Quiz Markdown modified"}
        </span>
        {!invalid && (
          <span
            aria-label={`${counts.added} lines added, ${counts.deleted} lines deleted`}
            className="font-mono text-[11px] font-semibold"
          >
            <span className="text-[#10B981]">+{counts.added}</span>{" "}
            <span className="text-[#EF4444]">-{counts.deleted}</span>
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            status === "pending" && "bg-[#F59E0B]/10 text-[#92400E]",
            status === "kept" && "bg-[#10B981]/10 text-[#047857]",
            status === "undone" && "bg-[#F1F5F9] text-[#64748B]",
            status === "conflict" && "bg-[#F59E0B]/15 text-[#92400E]",
            status === "invalid" && "bg-[#EF4444]/10 text-[#B91C1C]",
            status === "destructive" && "bg-[#EF4444]/10 text-[#B91C1C]",
          )}
        >
          {status === "pending" && "Pending review"}
          {status === "kept" && "Kept"}
          {status === "undone" && "Undone"}
          {status === "conflict" && "Editor changed — review required"}
          {status === "invalid" && "Invalid"}
          {status === "destructive" && "Existing questions not preserved — review required"}
        </span>
      </div>

      {status === "destructive" && (
        <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {preservation.lostCount > 0
            ? `The candidate changes or removes ${preservation.lostCount} existing question${
                preservation.lostCount === 1 ? "" : "s"
              } (Q${preservation.lostQuestionNumbers.slice(0, 5).join(", Q")}${
                preservation.lostQuestionNumbers.length > 5 ? "…" : ""
              }).`
            : preservation.addedCount > 0 && preservation.lostCount === 0
              ? "Your draft has no complete questions yet, so the assistant's changes cannot be verified against it — the candidate would replace the draft text."
              : "The candidate does not preserve the existing content."}{" "}
          Nothing was applied — review the diff and Keep all only if this is
          intentional.
        </p>
      )}

      {status === "pending" && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[#64748B]">
          Changes are applied to the editor as a pending change set — the live preview
          shows them. Keep all to accept, or Undo all to restore your document.
        </p>
      )}
      {status === "conflict" && (
        <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-[#92400E]">
          You edited the document while the assistant was working. Nothing was
          overwritten — review the diff and decide.
        </p>
      )}
      {status === "kept" && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[#047857]">
          Change set accepted and sealed into the editor.
        </p>
      )}
      {status === "undone" && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[#64748B]">
          Change set undone — the document was restored.
        </p>
      )}

      {invalid && diagnostics.length > 0 && (
        <ul aria-label="Candidate diagnostics" className="mt-2 space-y-1">
          {diagnostics.map((diagnostic, index) => (
            <li className="text-[11px] leading-relaxed text-[#EF4444]" key={index}>
              <span className="font-mono font-semibold">{diagnostic.code}</span>
              {": "}
              {diagnostic.message}
              {diagnostic.questionNumber !== null
                ? ` (question ${diagnostic.questionNumber}, line ${diagnostic.line}, column ${diagnostic.column})`
                : ` (line ${diagnostic.line}, column ${diagnostic.column})`}
            </li>
          ))}
        </ul>
      )}

      {confirmingUndo ? (
        <div className="mt-2.5 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-2.5">
          <p className="text-[11px] font-medium leading-relaxed text-[#92400E]">
            You edited the document after this change set was applied. Undo all
            restores the earlier snapshot and discards those manual edits.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="inline-flex h-8 items-center rounded-lg bg-[#EF4444] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]"
              onClick={() => {
                setConfirmingUndo(false);
                onUndoAll(changeSetId);
              }}
              type="button"
            >
              Restore anyway
            </button>
            <button
              className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-semibold text-[#64748B] transition-colors hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
              onClick={() => setConfirmingUndo(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {(status === "pending" ||
            status === "conflict" ||
            status === "invalid" ||
            status === "destructive") && (
            <MergeButton onClick={() => onReview(changeSetId)} variant="outline">
              Review
            </MergeButton>
          )}
          {(status === "pending" || status === "conflict" || status === "destructive") && (
            <MergeButton onClick={handleUndoClick} variant="outline">
              Undo all
            </MergeButton>
          )}
          {(status === "pending" ||
            status === "conflict" ||
            status === "invalid" ||
            status === "destructive") && (
            <MergeButton
              disabled={invalid}
              onClick={() => onKeepAll(changeSetId)}
              variant="primary"
            >
              Keep all
            </MergeButton>
          )}
        </div>
      )}
    </article>
  );
}

function MergeButton({
  children,
  disabled = false,
  onClick,
  variant,
}: {
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly variant: "primary" | "outline";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "bg-[#0052FF] text-white hover:bg-[#4D7CFF]"
          : "border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9]",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
