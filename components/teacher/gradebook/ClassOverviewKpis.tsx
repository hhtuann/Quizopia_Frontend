"use client";

import { useClassroomAnalyticsQuery } from "@/hooks/queries/use-classrooms";
import { formatPercent } from "./gradebook-status";
import type { ClassroomAnalyticsSessionItem } from "@/lib/api/classrooms";

/**
 * CLASS-M3 (#54): real Overview KPIs for the teacher class page, from
 * `GET /api/classrooms/{id}/analytics` — roster size, assigned sessions,
 * overall completion (null → "—", never 0), plus a compact per-session trend
 * list (latest first) with completion/average.
 */

function TrendRow({ s }: { s: ClassroomAnalyticsSessionItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0 truncate font-medium text-[#0F172A]">
        {s.title}
        <span className="ml-2 rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs text-[#64748B]">
          {s.code}
        </span>
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-[#64748B]">
        completion {s.completionPercentage == null ? "—" : formatPercent(s.completionPercentage)} ·
        avg {s.averagePercentage == null ? "—" : formatPercent(s.averagePercentage)}
      </span>
    </li>
  );
}

export function ClassOverviewKpis({ classroomId }: { classroomId: number }) {
  const { data, isPending, isError } = useClassroomAnalyticsQuery(classroomId);

  const kpi = (value: number | null | undefined): string =>
    isPending ? "…" : value == null ? "—" : String(value);

  return (
    <>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            Current roster
          </dt>
          <dd className="text-2xl font-bold tabular-nums text-[#0F172A]">
            {kpi(data?.currentRosterSize)}
          </dd>
        </div>
        <div>
          <dt className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            Assigned sessions
          </dt>
          <dd className="text-2xl font-bold tabular-nums text-[#0F172A]">
            {kpi(data?.assignedSessionCount)}
          </dd>
        </div>
        <div>
          <dt className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            Overall completion
          </dt>
          <dd className="text-2xl font-bold tabular-nums text-[#0F172A]">
            {isPending
              ? "…"
              : data?.overallCompletionPercentage == null
                ? "—"
                : formatPercent(data.overallCompletionPercentage)}
          </dd>
        </div>
      </dl>

      {isError && (
        <p className="mt-4 text-sm text-[#64748B]" role="status">
          Analytics are unavailable right now.
        </p>
      )}

      {data && data.sessions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            Session trends
          </h3>
          <ul className="mt-1 divide-y divide-[#E2E8F0]">
            {[...data.sessions].reverse().map((s) => (
              <TrendRow key={s.sessionId} s={s} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
