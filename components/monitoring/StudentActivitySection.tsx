"use client";

import { useMemo } from "react";
import type { DetailQuestionView } from "@/lib/api/student-attempt";
import { useAnswerHistoryQuery } from "@/hooks/queries/use-monitoring";
import { groupAnswerVersions } from "@/lib/monitoring/timeline";
import { AttemptTimeline } from "./AttemptTimeline";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Student-facing transparency section on the attempt result page (P4-A4):
 * "Your activity timeline" (REST only — what the client observed vs what the
 * server confirmed) and "Accepted answer versions" from answer-history.
 *
 * Answer CONTENT from history is intentionally not re-rendered per version —
 * only the accepted sequence + time, keeping the client-intent vs
 * server-confirmed distinction visible without duplicating question renderers.
 */
export function StudentActivitySection({
  attemptId,
  questions,
}: {
  attemptId: number;
  questions: DetailQuestionView[];
}) {
  // Labels match what the student saw: position in display order → "Q3".
  const questionLabels = useMemo(() => {
    const sorted = [...questions].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    );
    const labels: Record<number, string> = {};
    sorted.forEach((q, i) => {
      labels[q.attemptQuestionId] = `Q${i + 1}`;
    });
    return labels;
  }, [questions]);

  const history = useAnswerHistoryQuery(attemptId);

  const grouped = useMemo(
    () => groupAnswerVersions(history.data?.items ?? [], questionLabels),
    [history.data, questionLabels]
  );

  return (
    <div className="mt-6">
      <AttemptTimeline
        attemptId={attemptId}
        questionLabels={questionLabels}
        title="Your activity timeline"
        emptyHint="No activity was recorded for this attempt."
      />

      <div className={cn(cardVariants(), "mt-6 p-6")}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Accepted answer versions
          </h3>
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            {history.data?.totalCount ?? 0} accepted
          </span>
        </div>
        <p className="mb-4 text-xs font-medium text-[#64748B]">
          Each save the server confirmed, in order. Compare with the timeline
          above: what you did (client observation) vs what was durably recorded
          (server-confirmed).
        </p>

        {history.isPending ? (
          <p role="status" className="animate-pulse py-4 text-center text-sm text-[#64748B]">
            Loading answer history…
          </p>
        ) : history.isError ? (
          <p role="alert" className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-3 text-sm font-medium text-[#EF4444]">
            Couldn&apos;t load your answer history.
          </p>
        ) : grouped.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
            No answers were accepted for this attempt.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Accepted answer versions">
            {grouped.map((group) => (
              <li
                key={group.attemptQuestionId}
                className="flex flex-col gap-2 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <span className="min-w-16 shrink-0 text-sm font-semibold text-[#0F172A]">
                  {group.label}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {group.versions.map((v) => (
                    <span
                      key={v.sequence}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#0052FF]/30 bg-[#0052FF]/5 px-2.5 py-1 font-mono text-xs font-bold text-[#0052FF] tabular-nums"
                    >
                      v{v.sequence}
                      <span className="font-medium text-[#64748B]">
                        {formatTime(v.acceptedAt)}
                      </span>
                    </span>
                  ))}
                </span>
                <span className="ml-auto shrink-0 text-xs text-[#94A3B8]">
                  {group.versions.length} version{group.versions.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
