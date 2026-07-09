"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useImportQuestionsMutation } from "@/hooks/queries/use-question-import";
import { Button, SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  downloadImportTemplate,
  type ImportResponse,
  type RowError,
} from "@/lib/api/question-import";
import type { NormalizedApiError } from "@/lib/api";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB (backend is the source of truth).

const fileInputClass =
  "block w-full rounded-lg border border-[#E2E8F0] bg-white p-2 text-sm text-[#64748B] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2 file:mr-3 file:inline-flex file:h-11 file:cursor-pointer file:items-center file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-[#0052FF] file:to-[#4D7CFF] file:px-5 file:font-semibold file:text-white file:outline-none file:transition-all file:duration-200 hover:file:brightness-110 disabled:opacity-60";

/**
 * Maps a file-level error (NormalizedApiError) to a friendly message.
 *
 * - `kind:"api"` (UPLOAD errors — JSON body): map by `code` (and status for
 *   the reused QUESTION_IMPORT_FILE_INVALID code: 400/413/415).
 * - `kind:"http"` (DOWNLOAD errors — blob body obscures the JSON code): map by
 *   HTTP status.
 */
function describeError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "QUESTION_IMPORT_FILE_INVALID":
        if (norm.status === 413) return "File too large (max 5 MB).";
        if (norm.status === 415) return "Only .xlsx files are accepted.";
        return "The file is empty or unreadable. Re-download the template and try again.";
      case "QUESTION_IMPORT_TEMPLATE_INVALID":
        return "Workbook structure is invalid — re-download the template and try again.";
      case "QUESTION_IMPORT_DUPLICATE_CODE":
        return "Duplicate question codes detected — no rows were imported (all-or-nothing). Fix the duplicates and retry.";
      case "QUESTION_BANK_NOT_FOUND":
        return "This question bank could not be found.";
      case "QUESTION_BANK_ACCESS_DENIED":
      case "QUESTION_SUBJECT_SCHOOL_MISMATCH":
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
    if (norm.status === 404) return "This resource could not be found.";
    return norm.message || `Request failed (HTTP ${norm.status}).`;
  }
  if (norm?.kind === "network") {
    return "Network error — check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export function QuestionImport({ bankId }: { bankId: number }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useImportQuestionsMutation(bankId);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const handleDownload = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      const blob = await downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "quizopia-question-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(describeError(err));
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setClientError(null);
    setResult(null);

    // Client pre-check (backend remains the source of truth).
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setClientError("Only .xlsx files are accepted.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setClientError("File too large (max 5 MB).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    mutation.mutate(file, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setClientError(describeError(err)),
    });
  };

  const uploading = mutation.isPending;
  const busy = uploading || downloading;

  return (
    <section className={cn(cardVariants(), "p-6")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel className="mb-2">Import</SectionLabel>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Import questions
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            Upload an .xlsx workbook (max 5 MB). Validation happens server-side.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleDownload}
          disabled={busy}
        >
          {downloading ? "Preparing…" : "Download template"}
        </Button>
      </div>

      {downloadError && <Alert role="alert">{downloadError}</Alert>}

      {result ? (
        <ResultView result={result} onReset={reset} resetting={busy} />
      ) : (
        <div
          className={uploading ? "animate-pulse" : undefined}
          aria-busy={uploading || undefined}
        >
          <label htmlFor="q-import-file" className="sr-only">
            Choose an .xlsx workbook to import
          </label>
          <input
            id="q-import-file"
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            disabled={busy}
            className={fileInputClass}
          />
          {uploading && (
            <p role="status" className="mt-3 pl-1 text-xs font-medium text-[#64748B]">
              Importing…
            </p>
          )}
          {clientError && <Alert role="alert">{clientError}</Alert>}
        </div>
      )}
    </section>
  );
}

function ResultView({
  result,
  onReset,
  resetting,
}: {
  result: ImportResponse;
  onReset: () => void;
  resetting: boolean;
}) {
  const allValid = result.invalidRows === 0;
  return (
    <div>
      {/* Summary banner (partial success is still a 200, not an ApiError). */}
      <div
        role="status"
        className={cn(
          "mb-4 rounded-lg border p-4 text-sm font-medium",
          allValid
            ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
            : "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#0F172A]"
        )}
      >
        {allValid ? (
          <span>Imported all {result.totalRows} rows.</span>
        ) : (
          <span>
            Imported <strong className="font-bold">{result.importedRows}</strong> of{" "}
            <strong className="font-bold">{result.totalRows}</strong> rows ·{" "}
            <span className="text-[#64748B]">{result.invalidRows} had errors.</span>
          </span>
        )}
      </div>

      {result.errors.length > 0 && (
        <RowErrorsTable errors={result.errors} />
      )}

      <Button type="button" variant="outline" onClick={onReset} disabled={resetting}>
        Upload another
      </Button>
    </div>
  );
}

function RowErrorsTable({ errors }: { errors: RowError[] }) {
  return (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-3 px-1 text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          Row errors ({errors.length})
        </caption>
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Row</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Field</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Error</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Detail</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={`${e.rowNumber}-${i}`} className="border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 hover:bg-[#F1F5F9]">
              <td className="px-3 py-2 tabular-nums">{e.rowNumber}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {e.questionCode ?? "—"}
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

function Alert({ children, role }: { children: React.ReactNode; role: "alert" }) {
  return (
    <div
      role={role}
      className="mt-4 flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
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
      <span>{children}</span>
    </div>
  );
}
