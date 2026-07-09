"use client";

import { useSessionStatisticsQuery } from "@/hooks/queries/use-teacher-reporting";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE_MATRIX: "T/F",
  NUMERIC_FILL: "Numeric",
};

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: "accent" | "success" }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 text-center shadow-sm">
      <p
        className={cn(
          "text-xl font-extrabold tabular-nums",
          tone === "accent" ? "text-[#0052FF]" : tone === "success" ? "text-[#10B981]" : "text-[#0F172A]"
        )}
        role="status"
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-[#64748B]">{label}</p>
    </div>
  );
}

export function StatisticsPanel({ sessionId }: { sessionId: number }) {
  const { data, isPending, isError, error } = useSessionStatisticsQuery(sessionId);

  if (isPending) return <div className="py-8 text-center text-sm text-[#64748B]">Loading statistics…</div>;
  if (isError) {
    const msg = (error as unknown as NormalizedApiError | undefined)?.message || "Couldn't load statistics.";
    return <div role="alert" className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">{msg}</div>;
  }
  if (!data || data.bestResultCount === 0) {
    return <p className="py-8 text-center text-sm text-[#64748B]">No graded results yet.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MetricCard label="Eligible" value={fmt(data.eligibleStudentCount)} />
        <MetricCard label="Started" value={String(data.startedStudentCount)} />
        <MetricCard label="Submitted" value={String(data.submittedStudentCount)} tone="accent" />
        <MetricCard label="Graded" value={String(data.gradedStudentCount)} tone="success" />
        <MetricCard label="Avg %" value={fmtPct(data.averagePercentage)} />
        <MetricCard label="Median %" value={fmtPct(data.medianPercentage)} />
      </div>

      {/* Score range + averages */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Avg score" value={fmt(data.averageScore)} />
        <MetricCard label="Min score" value={fmt(data.minimumScore)} />
        <MetricCard label="Max score" value={fmt(data.maximumScore)} />
        <MetricCard label="Attempts" value={String(data.totalAttemptCount)} />
      </div>

      {/* Distribution table (NO charts) */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Score distribution (BEST)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-left font-mono uppercase tracking-[0.1em] text-[#64748B]">
                <th scope="col" className="px-2 pb-2 font-semibold">Range</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.distribution.map((b, i) => (
                <tr key={i} className="border-b border-[#E2E8F0] text-[#0F172A] last:border-0">
                  <td className="px-2 py-1 tabular-nums">{b.lowerBound}–{b.upperBound}{b.upperInclusive ? "]" : ")"}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-question table */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Per-question statistics</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-left font-mono uppercase tracking-[0.1em] text-[#64748B]">
                <th scope="col" className="px-2 pb-2 font-semibold">Q#</th>
                <th scope="col" className="px-2 pb-2 font-semibold">Type</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Ans</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Correct</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Wrong</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Skip</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Rate</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Avg score</th>
              </tr>
            </thead>
            <tbody>
              {data.perQuestionStatistics.map((q) => (
                <tr key={q.examQuestionId} className="border-b border-[#E2E8F0] text-[#0F172A] last:border-0">
                  <td className="px-2 py-1 tabular-nums">{q.examQuestionId}</td>
                  <td className="px-2 py-1">{TYPE_LABEL[q.questionType] ?? q.questionType}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{q.answeredCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[#10B981]">{q.correctCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[#64748B]">{q.incorrectCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[#94A3B8]">{q.unansweredCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{q.correctRate != null ? `${q.correctRate}%` : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{q.averageAwardedScore != null ? String(q.averageAwardedScore) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined): string {
  return v != null ? String(v) : "—";
}
function fmtPct(v: number | null | undefined): string {
  return v != null ? `${v}%` : "—";
}
