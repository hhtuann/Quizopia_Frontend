import type { ReactNode } from "react";

/**
 * Shared section header for the Exam Detail tabs (Overview / Questions /
 * Sessions): design-system heading, small metadata subtitle underneath, and
 * an optional actions slot aligned to the right (wraps below on small
 * screens). Presentational only — tab content owns the data.
 */
export function ExamDetailSectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">{title}</h2>
        {subtitle != null && <p className="mt-1 text-xs font-medium text-[#64748B]">{subtitle}</p>}
      </div>
      {actions != null && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
