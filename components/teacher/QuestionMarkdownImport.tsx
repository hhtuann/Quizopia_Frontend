"use client";

import { useMemo, useState } from "react";
import { QuizMarkdownAuthoringPane } from "@/components/markdown/authoring-pane";
import { useImportMarkdownQuestionsMutation } from "@/hooks/queries/use-question-import";
import { Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { analyzeQuizMarkdown } from "@/lib/quiz-markdown";
import { bankContractViolations } from "@/lib/quiz-markdown/bank-contract";
import type { ImportResponse, RowError } from "@/lib/api/question-import";
import type { NormalizedApiError } from "@/lib/api";

/** Mirrors the backend MarkdownQuestionImportService.MAX_MARKDOWN_CHARS. */
const MAX_MARKDOWN_CHARS = 262_144;

function describeError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "QUESTION_IMPORT_MARKDOWN_TOO_LARGE":
        return "The Markdown source is too large (max 256 KB).";
      case "QUESTION_IMPORT_MARKDOWN_TOO_MANY_QUESTIONS":
        return "The document has too many questions (max 200 per import).";
      case "QUESTION_IMPORT_DUPLICATE_CODE":
        return "A generated question code collided with an existing one — no questions were imported (all-or-nothing). Please retry.";
      case "QUESTION_BANK_NOT_FOUND":
        return "This question bank could not be found.";
      case "QUESTION_BANK_ACCESS_DENIED":
        return "You don't have permission to import questions into this bank.";
      case "AUTH_ACCESS_TOKEN_INVALID":
        return "Your session has expired — please sign in again.";
      default:
        return norm.message || "Import failed. Please try again.";
    }
  }
  if (norm?.kind === "http") {
    if (norm.status === 403) return "You don't have permission for this action.";
    if (norm.status === 401) return "Your session has expired — please sign in again.";
    if (norm.status === 404) return "This question bank could not be found.";
    return norm.message || `Request failed (HTTP ${norm.status}).`;
  }
  if (norm?.kind === "network") {
    return "Network error — check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Teacher-only Quiz Markdown import (P2-C, issue #18). Reuses the P2-M1
 * authoring pane (live diagnostics, markers, safe KaTeX, correct-answer
 * toggles); this component adds the bank-contract preflight (issue #10),
 * the explicit confirm step and the result/invalidate flow. The backend
 * re-parses and re-authorizes authoritatively — nothing here is trusted.
 */
export function QuestionMarkdownImport({ bankId }: { bankId: number }) {
  const mutation = useImportMarkdownQuestionsMutation(bankId);

  const [source, setSource] = useState("");
  const [collapsed, setCollapsed] = useState(true);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const analysis = useMemo(() => analyzeQuizMarkdown(source), [source]);
  const violations = useMemo(() => bankContractViolations(analysis), [analysis]);
  const questionCount = analysis.questions.length;
  const parseErrors = analysis.diagnostics.length;
  const tooLong = source.length > MAX_MARKDOWN_CHARS;
  const importable =
    source.trim().length > 0 &&
    !tooLong &&
    parseErrors === 0 &&
    violations.length === 0 &&
    questionCount > 0;

  const handleConfirm = () => {
    setClientError(null);
    setResult(null);
    mutation.mutate(source, {
      onSuccess: (data) => {
        setResult(data);
        if (data.importedRows === data.totalRows && data.errors.length === 0) {
          // Success clears the editor for the next document (no separate
          // result view / "Write another" round-trip) and folds the pane.
          setSource("");
          setCollapsed(true);
        }
      },
      onError: (err) => setClientError(describeError(err)),
    });
  };

  const importing = mutation.isPending;

  return (
    <section className={cn(cardVariants(), "p-6")} aria-label="Markdown import">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          Markdown authoring
        </h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[#E2E8F0] px-4 text-sm font-semibold text-[#64748B] outline-none transition-colors hover:border-[#0052FF]/30 hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          {collapsed ? "Write questions" : "Collapse"}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className={cn("h-3.5 w-3.5 transition-transform", collapsed ? "" : "rotate-180")}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {result && <ResultBanner result={result} />}

      <div className={collapsed ? "hidden" : "flex h-[70vh] min-h-[32rem] flex-col"}>
        <QuizMarkdownAuthoringPane value={source} onChange={setSource} />
      </div>

      {tooLong && (
        <p role="alert" className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">
          The document exceeds {MAX_MARKDOWN_CHARS.toLocaleString()} characters — split it into
          smaller imports.
        </p>
      )}

      {violations.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4">
          <p className="text-sm font-semibold text-[#0F172A]">
            Fix these before importing — the Question Bank rejects them at edit/publish time:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#0F172A]">
            {violations.map((v) => (
              <li key={`${v.questionNumber}-${v.code}`} data-testid="bank-contract-violation">
                <span className="rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 font-mono text-xs text-[#64748B]">
                  {v.code}
                </span>{" "}
                {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.errors.length > 0 && <RowErrorsTable errors={result.errors} />}

      {clientError && (
        <p role="alert" className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">
          {clientError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!importable || importing}
          aria-label={`Confirm adding ${questionCount} question${questionCount === 1 ? "" : "s"} to this question bank`}
        >
          {importing ? "Importing…" : `Add ${questionCount || ""} question${questionCount === 1 ? "" : "s"} to this bank`}
        </Button>
        {importing && (
          <span role="status" className="text-xs font-medium text-[#64748B]">
            Adding questions to bank #{bankId}…
          </span>
        )}
      </div>
    </section>
  );
}

function ResultBanner({ result }: { result: ImportResponse }) {
  const allImported = result.importedRows === result.totalRows && result.errors.length === 0;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 rounded-lg border p-4 text-sm font-medium",
        allImported
          ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
          : "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#0F172A]"
      )}
    >
      {allImported ? (
        <span>Added all {result.totalRows} questions to this bank.</span>
      ) : result.invalidRows > 0 ? (
        <span>
          Nothing was imported — {result.invalidRows} question
          {result.invalidRows === 1 ? "" : "s"} rejected (all-or-nothing).
        </span>
      ) : (
        <span>Nothing was imported — the document was rejected (all-or-nothing).</span>
      )}
    </div>
  );
}

function RowErrorsTable({ errors }: { errors: RowError[] }) {
  return (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Question</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Source</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Field</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Detail</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr
              key={`${e.rowNumber}-${i}`}
              className="border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 hover:bg-[#F1F5F9]"
            >
              <td className="px-3 py-2 tabular-nums">{e.rowNumber}</td>
              <td className="px-3 py-2 font-mono text-xs tabular-nums text-[#64748B]">
                {e.line != null && e.column != null ? `L${e.line}:C${e.column}` : "—"}
              </td>
              <td className="px-3 py-2 text-[#64748B]">{e.field ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[#64748B]">
                  {e.code}
                </span>
              </td>
              <td className="px-3 py-2 text-[#64748B]">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
