"use client";

import {
  GradebookStatusChip,
  formatPercent,
  formatScore,
  gradebookStatusLabel,
} from "./gradebook-status";
import type {
  GradebookCell,
  GradebookSessionColumn,
  GradebookStudentRow,
} from "@/lib/api/classrooms";
import { cn } from "@/lib/utils/cn";

/**
 * CLASS-M3 (#54): the gradebook matrix — students (rows, sticky first column)
 * × selected sessions (columns). Cell order is positional: `cells[i]` belongs
 * to `sessions[i]` per the server contract. A per-column footer summarizes
 * completion/average; departed students are flagged "(left)".
 */

function CellContent({ cell }: { cell: GradebookCell | undefined }) {
  if (!cell) return <span className="text-[#CBD5E1]">—</span>;
  switch (cell.status) {
    case "SCORED":
      return (
        <GradebookStatusChip status="SCORED">
          {formatScore(cell.score, cell.maxScore, cell.percentage)}
        </GradebookStatusChip>
      );
    case "NOT_IN_COHORT":
      // Outside the session cohort — nothing to grade. Short "n/a" text with
      // the full meaning in the accessible name (parity with the My Results
      // chip, which spells it out).
      return (
        <span
          className="text-xs font-medium text-[#CBD5E1]"
          title="Not in cohort"
          aria-label="Not in cohort"
        >
          n/a
        </span>
      );
    case "NOT_HELD":
      // Window/lifecycle states — muted text, no result yet to color-code.
      return <span className="text-xs font-medium text-[#94A3B8]">{gradebookStatusLabel(cell.status)}</span>;
    default:
      return <GradebookStatusChip status={cell.status} />;
  }
}

export function GradebookTable({
  sessions,
  students,
}: {
  sessions: GradebookSessionColumn[];
  students: GradebookStudentRow[];
}) {
  return (
    <div
      className="overflow-x-auto rounded-xl border border-[#E2E8F0]"
      role="region"
      aria-label="Gradebook matrix (scrollable table)"
      tabIndex={0}
    >
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">
          Per-student results by session, with each student&rsquo;s mean percentage and completion.
        </caption>
        <thead>
          <tr className="border-b border-[#E2E8F0] font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[180px] bg-white px-3 py-3 text-left font-normal"
            >
              Student
            </th>
            {sessions.map((s) => (
              <th key={s.id} scope="col" className="min-w-[150px] px-3 py-3 text-left font-normal">
                <span className="block max-w-[180px] truncate font-semibold normal-case tracking-normal text-[#0F172A]">
                  {s.title}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] normal-case tracking-normal text-[#94A3B8]">
                  {s.code}
                </span>
              </th>
            ))}
            <th scope="col" className="px-3 py-3 text-right font-normal">
              Mean %
            </th>
            <th scope="col" className="px-3 py-3 text-right font-normal">
              Completion
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((row) => (
            <tr
              key={row.userId}
              className="border-b border-[#E2E8F0]/60 transition-colors last:border-0 hover:bg-[#F8FAFC]"
            >
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 bg-white px-3 py-2.5 text-left font-medium",
                  row.currentMember ? "text-[#0F172A]" : "text-[#64748B]"
                )}
              >
                {row.displayName}
                {!row.currentMember && (
                  <span className="ml-1.5 text-xs font-normal italic text-[#94A3B8]">(left)</span>
                )}
              </th>
              {sessions.map((s, i) => (
                <td key={s.id} className="whitespace-nowrap px-3 py-2.5">
                  <CellContent cell={row.cells[i]} />
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#0F172A]">
                {row.meanPercentage == null ? "—" : formatPercent(row.meanPercentage)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#0F172A]">
                {row.completionPercentage == null ? "—" : formatPercent(row.completionPercentage)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#E2E8F0] bg-[#F8FAFC]/60 text-xs text-[#64748B]">
            <th scope="row" className="sticky left-0 z-10 bg-[#F8FAFC] px-3 py-2.5 text-left font-normal">
              Completion / avg
            </th>
            {sessions.map((s) => (
              <td key={s.id} className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                {s.completionPercentage == null ? "—" : formatPercent(s.completionPercentage)}
                {" · "}
                {s.averagePercentage == null ? "—" : formatPercent(s.averagePercentage)}
              </td>
            ))}
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
