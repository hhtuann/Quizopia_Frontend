"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  computeLineDiff,
  sideBySideDiffRows,
  type UnifiedDiffRow,
} from "@/lib/quiz-markdown/diff";

/**
 * Prism-style diff review dialog (Quizopia_System #121, UX-05).
 *
 * Large accessible dialog with real line-based Unified / Side-by-side
 * layouts, line numbers, red/green rows, honest +/- counters, internal
 * scrolling, and Keep all / Undo all actions that obey the same safeguards
 * as the inline merge card. Inspecting the diff never mutates the editor.
 */
export function AiDiffViewer({
  before,
  after,
  onDismiss,
  onKeepAll,
  onUndoAll,
  open,
  keepDisabled = false,
  undoDisabled = false,
}: {
  readonly before: string;
  readonly after: string;
  readonly onDismiss: () => void;
  readonly onKeepAll: () => void;
  readonly onUndoAll: () => void;
  readonly open: boolean;
  readonly keepDisabled?: boolean;
  readonly undoDisabled?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"unified" | "split">("unified");

  const diff = useMemo(
    () => computeLineDiff(before, after),
    [before, after],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = dialogRef.current;
    node?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-3 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby={titleId}
        className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_25px_60px_rgba(0,0,0,0.2)] focus-visible:outline-none"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[#0F172A]" id={titleId}>
              Review changes
            </h2>
            <span
              aria-label={`${diff.counts.added} lines added, ${diff.counts.deleted} lines deleted`}
              className="font-mono text-xs font-semibold"
            >
              <span className="text-[#10B981]">+{diff.counts.added}</span>{" "}
              <span className="text-[#EF4444]">-{diff.counts.deleted}</span>
            </span>
          </div>
          <div
            className="flex overflow-hidden rounded-lg border border-[#E2E8F0]"
            role="tablist"
            aria-label="Diff layout"
          >
            {(["unified", "split"] as const).map((option) => (
              <button
                aria-selected={mode === option}
                key={option}
                onClick={() => setMode(option)}
                role="tab"
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]",
                  mode === option
                    ? "bg-[#0052FF] text-white"
                    : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
                )}
                type="button"
              >
                {option === "unified" ? "Unified" : "Side-by-side"}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#F8FAFC]" data-testid="ai-diff-body">
          {diff.counts.added === 0 && diff.counts.deleted === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#64748B]" data-testid="ai-diff-no-changes">
              No changes — the candidate is identical to the current document.
            </p>
          ) : mode === "unified" ? (
            <table className="w-full border-collapse font-mono text-xs leading-5">
              <tbody>
                {diff.rows.map((row, index) => (
                  <UnifiedRow key={index} row={row} />
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse font-mono text-xs leading-5">
              <tbody>
                {sideBySideDiffRows(diff.rows).map((row, index) => (
                  <SplitRow key={index} row={row} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
          <button
            className="inline-flex h-9 items-center rounded-lg border border-[#E2E8F0] px-4 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={undoDisabled}
            onClick={onUndoAll}
            type="button"
          >
            Undo all
          </button>
          <button
            className="inline-flex h-9 items-center rounded-lg bg-[#0052FF] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#4D7CFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={keepDisabled}
            onClick={onKeepAll}
            type="button"
          >
            Keep all
          </button>
        </div>
      </div>
    </div>
  );
}

function UnifiedRow({ row }: { readonly row: UnifiedDiffRow }) {
  const marker = row.op === "insert" ? "+" : row.op === "delete" ? "-" : " ";
  return (
    <tr
      className={cn(
        row.op === "insert" && "bg-[#10B981]/10",
        row.op === "delete" && "bg-[#EF4444]/10",
      )}
    >
      <td className="w-10 select-none border-r border-[#E2E8F0] px-2 text-right text-[#94A3B8]">
        {row.beforeNumber ?? ""}
      </td>
      <td className="w-10 select-none border-r border-[#E2E8F0] px-2 text-right text-[#94A3B8]">
        {row.afterNumber ?? ""}
      </td>
      <td
        className={cn(
          "w-6 select-none text-center font-bold",
          row.op === "insert" && "text-[#10B981]",
          row.op === "delete" && "text-[#EF4444]",
          row.op === "equal" && "text-[#CBD5E1]",
        )}
      >
        {marker}
      </td>
      <td className="whitespace-pre-wrap break-words px-2 text-[#0F172A]">
        {row.text === "" ? "\u00A0" : row.text}
      </td>
    </tr>
  );
}

function SplitRow({
  row,
}: {
  readonly row: ReturnType<typeof sideBySideDiffRows>[number];
}) {
  return (
    <tr>
      <td
        className={cn(
          "w-1/2 whitespace-pre-wrap break-words border-r border-[#E2E8F0] px-2 align-top",
          row.before === null && "bg-[#10B981]/5",
          row.before !== null && row.after === null && "bg-[#EF4444]/10",
          row.before !== null && row.after !== null && row.op === "replace" && "bg-[#EF4444]/10",
        )}
      >
        {row.before === null ? (
          ""
        ) : (
          <span className="mr-2 inline-block w-8 select-none text-right text-[#94A3B8]">
            {row.before.number}
          </span>
        )}
        <span className={cn(row.before !== null && row.after === null && "text-[#EF4444]")}>
          {row.before?.text === "" ? "\u00A0" : row.before?.text ?? ""}
        </span>
      </td>
      <td
        className={cn(
          "w-1/2 whitespace-pre-wrap break-words px-2 align-top",
          row.after === null && "bg-[#EF4444]/5",
          row.after !== null && row.before === null && "bg-[#10B981]/10",
          row.after !== null && row.before !== null && row.op === "replace" && "bg-[#10B981]/10",
        )}
      >
        {row.after === null ? (
          ""
        ) : (
          <span className="mr-2 inline-block w-8 select-none text-right text-[#94A3B8]">
            {row.after.number}
          </span>
        )}
        <span className={cn(row.after !== null && row.before === null && "text-[#10B981]")}>
          {row.after?.text === "" ? "\u00A0" : row.after?.text ?? ""}
        </span>
      </td>
    </tr>
  );
}

