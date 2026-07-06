"use client";

import { useState } from "react";
import { exportSessionResults } from "@/lib/api/teacher-reporting";
import { ResultsTable } from "./ResultsTable";
import { StatisticsPanel } from "./StatisticsPanel";

/**
 * Teacher reporting section: results table (paginated/sort/filtered) +
 * statistics panel (counts/distribution/per-question) + Excel export.
 * NO answerKey — only aggregate stats + scores.
 */
export function ReportingSection({ sessionId }: { sessionId: number }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportSessionResults(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quizopia-session-${sessionId}-results.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#3D4852]">
          Results &amp; statistics
        </h2>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-[#E0E5EC] px-4 text-xs font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {exporting ? "Exporting…" : "Export Excel"}
        </button>
      </div>

      {exportError && (
        <p role="alert" className="rounded-2xl bg-[#E0E5EC] px-4 py-2 text-xs font-medium text-[#3D4852] shadow-inset-deep">{exportError}</p>
      )}

      <StatisticsPanel sessionId={sessionId} />
      <ResultsTable sessionId={sessionId} />
    </div>
  );
}
