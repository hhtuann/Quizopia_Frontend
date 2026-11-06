"use client";

import { useState } from "react";
import { StudentSearchSelect } from "@/components/teacher/StudentSearchSelect";
import { RosterImportPanel } from "@/components/teacher/RosterImportPanel";
import { ClassRosterPanel } from "@/components/teacher/ClassRosterPanel";
import { SegmentedControl, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
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

  return (
    <section className={cn(cardVariants(), "p-6")} aria-label="Add students">
      <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
        Add students
      </h2>
      <p className="mt-1 text-xs font-medium text-[#64748B]">
        {MODE_DESCRIPTION[mode]}
      </p>

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
