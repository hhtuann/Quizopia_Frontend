"use client";

import { useRef, useState } from "react";
import {
  downloadRosterTemplate,
  useRosterConfirmMutation,
  useRosterPreviewMutation,
} from "@/hooks/queries/use-classrooms";
import type { RosterPreviewResult, RosterConfirmResult } from "@/lib/api/classrooms";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Identity-M4: "Import học sinh" — download the versioned XLSX template,
 * upload for a read-only preview (row/column errors + duplicates), then
 * confirm the idempotent batch import.
 */
export function RosterImportPanel({
  classId,
  unboxed = false,
}: {
  classId: number;
  /** Render inside AddStudentsPanel without the section heading (card provided by the host). */
  unboxed?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterPreviewResult | null>(null);
  const [result, setResult] = useState<RosterConfirmResult | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const previewMutation = useRosterPreviewMutation(classId);
  const confirmMutation = useRosterConfirmMutation(classId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function onDownloadTemplate() {
    setDownloading(true);
    try {
      const blob = await downloadRosterTemplate(classId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "quizopia-roster-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ kind: "error", message: "Could not download the template." });
    } finally {
      setDownloading(false);
    }
  }

  function onPickFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setNotice(null);
    if (f !== null) {
      // Auto-preview as soon as a workbook is picked (owner request): rows or
      // a read error appear immediately; the Import button sits on this row.
      void runPreview(f);
    }
  }

  function runPreview(f: File) {
    previewMutation.mutate(f, {
      onSuccess: (data) => {
        setPreview(data);
        setNotice(null);
      },
      onError: () =>
        setNotice({
          kind: "error",
          message: "Could not read the workbook. Check the format, size (≤ 2 MB) and headers.",
        }),
    });
  }

  function onConfirm() {
    if (!file) return;
    confirmMutation.mutate(file, {
      onSuccess: (data) => {
        setResult(data);
        setPreview(null);
        onPickFile(null);
        if (inputRef.current) inputRef.current.value = "";
      },
      onError: () => setNotice({ kind: "error", message: "Import failed. Please retry." }),
    });
  }

  // Same file-input styling as the question Excel import (QuestionImport).

  return (
    <section
      className={unboxed ? "" : "mt-8"}
      aria-label="Import students from Excel"
    >
      {!unboxed && (
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Import students (Excel)</h2>
          <Button
              type="button"
              variant="outline"
              onClick={onDownloadTemplate}
              disabled={downloading}
              aria-label="Download template"
              title="Download template"
              className="aspect-square w-11 px-0"
            >
              {downloading ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
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
            </Button>
        </div>
      )}
      {!unboxed && (
        <p className="mt-1 text-sm text-[#64748B]">
          Upload the filled template to preview the rows, then confirm the import. Duplicates and
          invalid rows are reported per row — nothing is imported silently.
        </p>
      )}

      <label className="flex h-12 w-full cursor-pointer items-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white transition-all duration-200 focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2">
        <span className="inline-flex h-12 shrink-0 cursor-pointer items-center rounded-l-lg bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110">
          Choose file
        </span>
        <span className="min-w-0 flex-1 truncate px-4 text-sm text-[#64748B]" aria-live="polite">
          {file ? file.name : "No file chosen"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <div className="mt-3">
        <Button
          type="button"
          disabled={!file || !preview || preview.ready === 0 || confirmMutation.isPending}
          onClick={onConfirm}
        >
          {confirmMutation.isPending
            ? "Importing…"
            : preview
              ? `Import ${preview.ready} row${preview.ready === 1 ? "" : "s"}`
              : "Import"}
        </Button>
      </div>

      {notice && (
        <p
          role="status"
          className={cn("mt-3 text-sm", notice.kind === "success" ? "text-green-600" : "text-red-600")}
        >
          {notice.message}
        </p>
      )}

      {preview && (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-2 text-sm text-[#64748B]">
            {preview.ready} of {preview.totalRows} rows ready. Hover a non-READY status for its
            details; rows with problems are skipped on import.
          </p>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-xs uppercase tracking-wide text-[#64748B]">
                <th className="py-2 pr-4">Row</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.sheetRow} className="border-b border-[#E2E8F0]/60">
                  <td className="py-2 pr-4">{row.sheetRow}</td>
                  <td className="py-2 pr-4">{row.fullName ?? "—"}</td>
                  <td className="py-2 pr-4">{row.email ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      variant={rowStatusVariant(row.status)}
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
      )}

      {result && (
        <div className={cn(cardVariants(), "mt-4 p-4 text-sm")} role="status">
          <p className="font-medium">
            Imported {result.imported} row{result.imported === 1 ? "" : "s"}
            {result.duplicates > 0 ? `, ${result.duplicates} duplicate(s) skipped` : ""}
            {result.failed > 0 ? `, ${result.failed} invalid row(s)` : ""}.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[#64748B]">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.sheetRow} — {e.column}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function rowStatusVariant(status: string): "success" | "default" | "warn" | "destructive" {
  switch (status) {
    case "READY":
      return "success";
    case "DUPLICATE_IN_FILE":
    case "DUPLICATE_IN_CLASS":
      return "warn";
    default:
      return "destructive";
  }
}
