"use client";

import { useState } from "react";
import { StudentSearchSelect } from "@/components/teacher/StudentSearchSelect";
import { RosterImportPanel } from "@/components/teacher/RosterImportPanel";
import { ClassRosterPanel } from "@/components/teacher/ClassRosterPanel";
import { Button, SegmentedControl, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { downloadRosterTemplate } from "@/hooks/queries/use-classrooms";
import type { AddMembersResponse } from "@/lib/api/classrooms";

type AddStudentsMode = "search" | "excel" | "email";

const MODE_OPTIONS = [
  { label: "Search", value: "search" as const },
  { label: "Excel Import", value: "excel" as const },
  { label: "Email Invitations", value: "email" as const },
];

const MODE_DESCRIPTION: Record<AddStudentsMode, string> = {
  search: "Find existing students by code, name, or username and add them to this class.",
  excel: "Upload an .xlsx workbook (max 5 MB). Rows are previewed and validated server-side.",
  email:
    "Add learners by email before they register — they join automatically once they verify it.",
};

/**
 * One compact card for every way to add students to a class (owner request):
 * Search | Excel Import | Email Invitations behind a segmented control — the
 * same pattern as the question-bank import (Excel | Markdown Authoring) —
 * instead of three stacked full-width sections.
 */
export function AddStudentsPanel({
  classId,
  excludeIds,
  onSearchResult,
}: {
  classId: number;
  excludeIds: number[];
  onSearchResult: (r: AddMembersResponse) => void;
}) {
  const [mode, setMode] = useState<AddStudentsMode>("search");
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
      // Surface quietly; the roster panel shows its own error notice.
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className={cn(cardVariants(), "p-6")} aria-label="Add students">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Add students
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            {MODE_DESCRIPTION[mode]}
          </p>
        </div>
        {mode === "excel" && (
          <button
            type="button"
            onClick={onDownloadTemplate}
            disabled={downloading}
            aria-label="Download template"
            title="Download template"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#64748B] outline-none transition-colors hover:bg-[#0052FF]/5 hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {downloading ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
          </button>
        )}
      </div>

      <div className="mt-4">
        <SegmentedControl
          aria-label="Add students method"
          onChange={setMode}
          options={MODE_OPTIONS}
          value={mode}
        />
      </div>

      {mode === "search" && (
        <StudentSearchSelect
          classId={classId}
          excludeIds={excludeIds}
          onResult={onSearchResult}
          unboxed
        />
      )}
      {mode === "excel" && <RosterImportPanel classId={classId} unboxed />}
      {mode === "email" && <ClassRosterPanel classId={classId} unboxed />}
    </section>
  );
}
