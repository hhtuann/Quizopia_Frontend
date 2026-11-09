import { cn } from "@/lib/utils/cn";
import type { GradebookCellStatus } from "@/lib/api/classrooms";

/**
 * CLASS-M3 (#54): shared presentation for `GradebookCellStatus` — used by the
 * teacher gradebook matrix cells and the learner My Results chips, so both
 * surfaces keep identical color semantics (status is always conveyed by text,
 * never color alone).
 */

const PRESENTATION: Record<GradebookCellStatus, { label: string; chip: string }> = {
  SCORED: { label: "Scored", chip: "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]" },
  PENDING_GRADING: { label: "Pending grading", chip: "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#F59E0B]" },
  IN_PROGRESS: { label: "In progress", chip: "border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]" },
  NOT_ATTEMPTED: { label: "Not attempted", chip: "border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]" },
  NOT_IN_COHORT: { label: "Not in cohort", chip: "border-[#E2E8F0] bg-[#F1F5F9] text-[#94A3B8]" },
  UPCOMING: { label: "Upcoming", chip: "border-[#E2E8F0] bg-transparent text-[#94A3B8]" },
  DRAFT: { label: "Draft", chip: "border-[#E2E8F0] bg-transparent text-[#94A3B8]" },
  CANCELLED: { label: "Cancelled", chip: "border-[#E2E8F0] bg-transparent text-[#94A3B8]" },
  NOT_HELD: { label: "Not held", chip: "border-[#E2E8F0] bg-transparent text-[#94A3B8]" },
};

/** Human label for a status (also the accessible text of the chip). */
export function gradebookStatusLabel(status: GradebookCellStatus): string {
  return PRESENTATION[status].label;
}

/** Status chip; `children` overrides the default label (e.g. "7/10 · 70%"). */
export function GradebookStatusChip({
  status,
  children,
  className,
}: {
  status: GradebookCellStatus;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
        PRESENTATION[status].chip,
        className
      )}
    >
      {children ?? PRESENTATION[status].label}
    </span>
  );
}

/** Percentage rounded to a whole number (display only). */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** SCORED text: `score/max · percentage%` (falls back to the label). */
export function formatScore(
  score: number | null,
  maxScore: number | null,
  percentage: number | null
): string {
  if (score == null || maxScore == null) return PRESENTATION.SCORED.label;
  if (percentage == null) return `${score}/${maxScore}`;
  return `${score}/${maxScore} · ${formatPercent(percentage)}`;
}
