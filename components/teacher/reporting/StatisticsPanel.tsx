"use client";

import { useSessionStatisticsQuery } from "@/hooks/queries/use-teacher-reporting";
import type { NormalizedApiError } from "@/lib/api";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE_MATRIX: "T/F",
  NUMERIC_FILL: "Numeric",
};

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-[#E0E5EC] p-3 text-center shadow-inset-small">
      <p className={`text-xl font-extrabold tabular-nums ${tone ?? "text-[#3D4852]"}`} role="status">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
    </div>
  );
}

export function StatisticsPanel({ sessionId }: { sessionId: number }) {
  const { data, isPending, isError, error } = useSessionStatisticsQuery(sessionId);

  if (isPending) return <div className="py-8 text-center text-sm text-[#6B7280]">Loading statistics…</div>;
  if (isError) {
    const msg = (error as unknown as NormalizedApiError | undefined)?.message || "Couldn't load statistics.";
    return <div role="alert" className="rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep">{msg}</div>;
  }
  if (!data || data.bestResultCount === 0) {
    return <p className="py-8 text-center text-sm text-[#6B7280]">No graded results yet.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MetricCard label="Eligible" value={fmt(data.eligibleStudentCount)} />
        <MetricCard label="Started" value={String(data.startedStudentCount)} />
        <MetricCard label="Submitted" value={String(data.submittedStudentCount)} tone="text-[#6C63FF]" />
        <MetricCard label="Graded" value={String(data.gradedStudentCount)} tone="text-[#38B2AC]" />
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Score distribution (BEST)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wider text-[#6B7280]">
                <th scope="col" className="px-2 pb-2 font-semibold">Range</th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.distribution.map((b, i) => (
                <tr key={i} className="text-[#3D4852]">
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Per-question statistics</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wider text-[#6B7280]">
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
                <tr key={q.examQuestionId} className="text-[#3D4852]">
                  <td className="px-2 py-1 tabular-nums">{q.examQuestionId}</td>
                  <td className="px-2 py-1">{TYPE_LABEL[q.questionType] ?? q.questionType}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{q.answeredCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[#38B2AC]">{q.correctCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[#6B7280]">{q.incorrectCount}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[#A0AEC0]">{q.unansweredCount}</td>
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
