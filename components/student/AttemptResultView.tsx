"use client";

import Link from "next/link";
import type { AttemptDetailResponse } from "@/lib/api/student-attempt";
import type { AttemptResultResponse } from "@/lib/api/student-results";
import { useMyBestResultQuery } from "@/hooks/queries/use-student-results";
import { Badge, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE_MATRIX: "True/False matrix",
  NUMERIC_FILL: "Numeric fill",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Render the student's answer from the detail's savedAnswer payload. Never the correct answer. */
function StudentAnswerDisplay({
  questionType,
  payload,
}: {
  questionType: string;
  payload: unknown;
}) {
  if (!payload) {
    return <p className="text-sm text-[#94A3B8]">No answer recorded</p>;
  }
  const p = payload as Record<string, unknown>;
  switch (questionType) {
    case "SINGLE_CHOICE":
      return <p className="text-sm font-medium text-[#0F172A]">Selected: {String(p.selectedOptionKey ?? "—")}</p>;
    case "MULTIPLE_CHOICE": {
      const keys = Array.isArray(p.selectedOptionKeys) ? (p.selectedOptionKeys as string[]) : [];
      return <p className="text-sm font-medium text-[#0F172A]">Selected: {keys.join(", ") || "—"}</p>;
    }
    case "TRUE_FALSE_MATRIX": {
      const responses = (p.responses ?? {}) as Record<string, boolean>;
      const summary = Object.entries(responses)
        .map(([k, v]) => `${k}:${v ? "T" : "F"}`)
        .join("  ");
      return <p className="text-sm font-medium text-[#0F172A]">{summary || "—"}</p>;
    }
    case "NUMERIC_FILL":
      return <p className="text-sm font-medium text-[#0F172A]">Answer: {String(p.value ?? "—")}</p>;
    default:
      return null;
  }
}

/** Outcome badge: correct (success) / wrong (muted) / not answered (grey). */
function OutcomeBadge({ correct, answered }: { correct: boolean; answered: boolean }) {
  if (!answered) {
    return (
      <Badge variant="default" className="gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5" /></svg>
        Not answered
      </Badge>
    );
  }
  if (correct) {
    return (
      <Badge variant="success" className="gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        Correct
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      Incorrect
    </Badge>
  );
}

/**
 * Full attempt result view: score summary + per-question breakdown.
 * Combines `result` (grading) with `detail` (content + savedAnswer).
 * NO answerKey — `correct` is the grading outcome only.
 */
export function AttemptResultView({
  result,
  detail,
}: {
  result: AttemptResultResponse;
  detail: AttemptDetailResponse | null;
}) {
  // BEST: check if there's a better attempt to link to.
  const { data: bestResult } = useMyBestResultQuery(
    result.examSessionId,
    !result.isBest
  );

  // Combine result questions with detail questions (by attemptQuestionId) for content.
  const detailMap = new Map<number, (typeof detail extends null ? never : NonNullable<typeof detail>)["questions"][number]>();
  if (detail) {
    for (const q of detail.questions) {
      detailMap.set(q.attemptQuestionId, q);
    }
  }
  // Sort result questions by displayOrder from detail (fallback to attemptQuestionId).
  const sorted = [...result.questionResults].sort((a, b) => {
    const oa = detailMap.get(a.attemptQuestionId)?.displayOrder ?? a.attemptQuestionId;
    const ob = detailMap.get(b.attemptQuestionId)?.displayOrder ?? b.attemptQuestionId;
    return oa - ob;
  });

  const notGraded = result.score == null;

  return (
    <div>
      {/* Score summary */}
      <div className={cn(cardVariants({ variant: "elevated" }), "mb-6 p-8 text-center")}>
        {result.isBest && (
          <Badge variant="accent" className="mb-3 gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.989l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
            Best attempt
          </Badge>
        )}
        {notGraded ? (
          <p className="font-display text-2xl font-extrabold tracking-tight text-[#64748B]">Not yet graded</p>
        ) : (
          <>
            <p className="text-5xl font-extrabold tabular-nums text-[#0F172A]">
              {result.score}
              <span className="text-2xl text-[#64748B]"> / {result.maxScore}</span>
            </p>
            {result.percentage != null && (
              <p className="mt-2 text-lg font-bold text-[#0052FF]">{result.percentage}%</p>
            )}
          </>
        )}
        <p className="mt-4 text-xs font-medium text-[#64748B]">
          Attempt #{result.attemptCount > 0 ? result.attemptCount : "—"} · Submitted {formatDateTime(result.submittedAt)}
          {result.gradedAt ? ` · Graded ${formatDateTime(result.gradedAt)}` : ""}
        </p>
      </div>

      {/* BEST link (if not best and a best exists) */}
      {!result.isBest && bestResult && bestResult.attemptId !== result.attemptId && (
        <div className="mb-6 text-center">
          <Link
            href={`/attempts/${bestResult.attemptId}/result`}
            className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
          >
            View your best attempt →
          </Link>
        </div>
      )}

      {/* Per-question results */}
      {!notGraded && sorted.length > 0 && (
        <div>
          <div className="space-y-4">
            {sorted.map((qr, i) => {
              const detailQ = detailMap.get(qr.attemptQuestionId);
              return (
                <div key={qr.attemptQuestionId} className={cn(cardVariants(), "p-5")}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-[#64748B]">
                        Q{i + 1}
                      </span>
                      <span className="font-mono text-xs font-medium text-[#64748B]">
                        {TYPE_LABEL[qr.questionType] ?? qr.questionType}
                      </span>
                    </div>
                    <OutcomeBadge correct={qr.correct} answered={qr.answered} />
                  </div>
                  {detailQ && (
                    <h3 className="mb-3 text-sm font-semibold text-[#0F172A]">{detailQ.content}</h3>
                  )}
                  {detailQ && (
                    <div className="mb-2 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2">
                      <StudentAnswerDisplay
                        questionType={qr.questionType}
                        payload={detailQ.savedAnswer?.answerPayload ?? null}
                      />
                    </div>
                  )}
                  <p className="text-xs font-semibold text-[#64748B]">
                    Score: {qr.awardedScore ?? "—"} / {qr.maxScore ?? "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
