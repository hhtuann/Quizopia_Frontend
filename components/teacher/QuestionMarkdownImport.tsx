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

const SAMPLE = `Câu 1 [SINGLE_CHOICE]: 2 + 2 bằng bao nhiêu?
*A. 4
B. 3
C. 5
D. 6
Lời giải: 2 + 2 = 4

Câu 2 [NUMERIC_FILL]: 10 / 4 (viết hai chữ số thập phân)?
Đáp án: 2.50
`;

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

  const [source, setSource] = useState(SAMPLE);
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

  const reset = () => {
    setResult(null);
    setClientError(null);
  };

  const handleConfirm = () => {
    setClientError(null);
    setResult(null);
    mutation.mutate(source, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setClientError(describeError(err)),
    });
  };

  const importing = mutation.isPending;

  if (result) {
    const allImported = result.importedRows === result.totalRows && result.errors.length === 0;
    return (
      <section className={cn(cardVariants(), "p-6")} aria-label="Markdown import result">
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
          ) : (
            <span>
              Nothing was imported — {result.invalidRows} question
              {result.invalidRows === 1 ? "" : "s"} rejected (all-or-nothing).
            </span>
          )}
        </div>
        {result.errors.length > 0 && <RowErrorsTable errors={result.errors} />}
        <Button type="button" variant="outline" onClick={reset} disabled={importing}>
          Write another
        </Button>
      </section>
    );
  }

  return (
    <section className={cn(cardVariants(), "p-6")} aria-label="Markdown import">
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          Author questions in Quiz Markdown
        </h2>
        <p className="mt-1 text-xs font-medium text-[#64748B]">
          Live preview with diagnostics. Review, then explicitly confirm adding the
          questions to this bank — the whole document imports atomically or not at all.
        </p>
      </div>

      <QuizMarkdownAuthoringPane value={source} onChange={setSource} />

      {/* Preflight summary (mirror of the backend checks; server decides). */}
      <div
        role="status"
        className={cn(
          "mt-4 rounded-lg border p-4 text-sm font-medium",
          importable
            ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
            : "border-[#E2E8F0] bg-[#F1F5F9] text-[#0F172A]"
        )}
      >
        {questionCount} question{questionCount === 1 ? "" : "s"} parsed · {parseErrors} grammar
        diagnostic{parseErrors === 1 ? "" : "s"} · {violations.length} bank-contract issue
        {violations.length === 1 ? "" : "s"}
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

function RowErrorsTable({ errors }: { errors: RowError[] }) {
  return (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Question</th>
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
