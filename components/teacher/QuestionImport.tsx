"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useImportQuestionsMutation } from "@/hooks/queries/use-question-import";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  downloadImportTemplate,
  previewQuestions,
  type ExcelImportPreview,
  type ImportResponse,
  type RowError,
} from "@/lib/api/question-import";
import type { NormalizedApiError } from "@/lib/api";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB (backend is the source of truth).

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
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);

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
    setFileName(null);
    setFile(null);
    setPreview(null);
    setClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? null);
    setFile(file ?? null);
    setPreview(null);
    setResult(null);
    if (file != null) {
      // Read-only preview immediately; the explicit Import button uploads.
      previewQuestions(bankId, file)
        .then(setPreview)
        .catch((err) => setClientError(describeError(err)));
    }
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

  };

  const onImport = () => {
    if (file == null) return;
    setClientError(null);
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
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Import questions
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            Upload an .xlsx workbook (max 5 MB). Validation happens server-side.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          aria-label="Download template"
          title="Download template"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#64748B] outline-none transition-colors hover:bg-[#0052FF]/5 hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
          {downloading ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.5"
                className="opacity-25"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          )}
        </button>
      </div>

      {downloadError && <Alert role="alert">{downloadError}</Alert>}

      {result ? (
        <ResultView result={result} onReset={reset} resetting={busy} />
      ) : (
        <div
          className={uploading ? "animate-pulse" : undefined}
          aria-busy={uploading || undefined}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="q-import-file"
              className="flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-2 transition-all duration-200 focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              aria-disabled={busy || undefined}
            >
              <span className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110">
                Choose file
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[#64748B]" aria-live="polite">
                {uploading ? "Importing…" : (fileName ?? "No file chosen")}
              </span>
              <input
                id="q-import-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                disabled={busy}
                className="sr-only"
              />
            </label>
            <Button
              type="button"
              className="shrink-0"
              disabled={file == null || preview == null || preview.readyRows === 0 || busy}
              onClick={onImport}
            >
              {uploading
                ? "Importing…"
                : preview
                  ? `Import ${preview.readyRows} question${preview.readyRows === 1 ? "" : "s"}`
                  : "Import"}
            </Button>
          </div>

          {preview && (
            <PreviewTable preview={preview} />
          )}
          {clientError && <Alert role="alert">{clientError}</Alert>}
        </div>
      )}
    </section>
  );
}

function PreviewTable({ preview }: { preview: ExcelImportPreview }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <p className="mb-2 text-sm text-[#64748B]">
        {preview.readyRows} of {preview.totalRows} rows ready. Hover a non-READY status for its
        details; rows with problems are skipped on import.
      </p>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-xs uppercase tracking-wide text-[#64748B]">
            <th className="py-2 pr-4">Row</th>
            <th className="py-2 pr-4">Question</th>
            <th className="py-2 pr-4 text-center">Correct answers</th>
            <th className="py-2 pr-4 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row) => (
            <tr key={row.rowNumber} className="border-b border-[#E2E8F0]/60">
              <td className="py-2 pr-4 tabular-nums">{row.rowNumber}</td>
              <td className="max-w-md truncate py-2 pr-4">{row.content ?? "—"}</td>
              <td className="py-2 pr-4 text-center font-mono text-xs text-[#64748B]">
                {row.correctAnswers.length > 0 ? row.correctAnswers.join(", ") : "—"}
              </td>
              <td className="py-2 pr-4 text-center">
                <Badge
                  variant={row.status === "READY" ? "success" : "destructive"}
                  title={row.issues.length > 0 ? row.issues.join("; ") : undefined}
                >
                  {row.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
            <tr key={`${e.rowNumber}-${i}`} className="border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-2 tabular-nums">{e.rowNumber}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {e.questionCode ?? "—"}
              </td>
              <td className="px-3 py-2 text-[#64748B]">{e.field ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[#64748B] transition-colors group-hover:text-[#0052FF]">
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
