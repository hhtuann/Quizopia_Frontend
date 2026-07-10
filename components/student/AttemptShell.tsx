"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AttemptDetailResponse, DetailQuestionView } from "@/lib/api/student-attempt";
import { useAnswerStore } from "@/lib/attempt/answer-store";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { SingleChoiceQuestion } from "./questions/SingleChoiceQuestion";
import { MultipleChoiceQuestion } from "./questions/MultipleChoiceQuestion";
import { TrueFalseMatrixQuestion } from "./questions/TrueFalseMatrixQuestion";
import { NumericFillQuestion } from "./questions/NumericFillQuestion";
import type { AutosaveStatus } from "@/lib/attempt/use-autosave";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE_MATRIX: "True/False matrix",
  NUMERIC_FILL: "Numeric fill",
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function QuestionRenderer({ question }: { question: DetailQuestionView }) {
  switch (question.questionType) {
    case "SINGLE_CHOICE":
      return <SingleChoiceQuestion question={question} />;
    case "MULTIPLE_CHOICE":
      return <MultipleChoiceQuestion question={question} />;
    case "TRUE_FALSE_MATRIX":
      return <TrueFalseMatrixQuestion question={question} />;
    case "NUMERIC_FILL":
      return <NumericFillQuestion question={question} />;
    default:
      return <p className="text-sm text-[#94A3B8]">Unsupported question type: {question.questionType}</p>;
  }
}

function FlagIcon({ filled }: { filled: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-18m0 0h13.5l-2 4 2 4H3" />
    </svg>
  );
}

export function AttemptShell({
  detail,
  autosaveStatus,
  submitSlot,
  liveServerTime,
  wsStatus,
}: {
  detail: AttemptDetailResponse;
  autosaveStatus?: AutosaveStatus;
  submitSlot?: ReactNode;
  liveServerTime?: string | null;
  wsStatus?: "connecting" | "connected" | "disconnected";
}) {
  const hydrate = useAnswerStore((s) => s.hydrate);
  const flagged = useAnswerStore((s) => s.flagged);
  const toggleFlag = useAnswerStore((s) => s.toggleFlag);
  const answers = useAnswerStore((s) => s.answers);

  useEffect(() => {
    hydrate(detail.questions);
  }, [detail, hydrate]);

  // Disable browser back + right-click during exam.
  // Hide the main page scrollbar so only the AttemptShell overlay scrolls.
  useEffect(() => {
    const blockCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockCtx);
    const html = document.documentElement;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("contextmenu", blockCtx);
      html.style.overflow = "";
    };
  }, []);

  // Timer
  const deadlineMs = new Date(detail.deadlineAt).getTime();
  const [nowMs, setNowMs] = useState(() =>
    new Date(liveServerTime ?? detail.serverTime).getTime()
  );
  const [prevLive, setPrevLive] = useState(liveServerTime);
  if (liveServerTime !== prevLive) {
    setPrevLive(liveServerTime);
    if (liveServerTime) setNowMs(new Date(liveServerTime).getTime());
  }
  useEffect(() => {
    const id = setInterval(() => setNowMs((prev) => prev + 1000), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const sorted = [...detail.questions].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );
  const expired = remainingMs <= 0;

  const scrollToQuestion = (index: number) => {
    document.getElementById(`attempt-q-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    // Fullscreen overlay — hides the AppShell (sidebar/footer/nav).
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#FAFAFA]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mx-auto flex max-w-6xl gap-6 p-6">
        {/* Main column: questions only */}
        <div className="min-w-0 flex-1">
          {expired && (
            <div role="alert" className="mb-6 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]">
              Time has expired.
            </div>
          )}

          {/* Questions */}
          <div className="space-y-6">
            {sorted.map((q, i) => {
              const isFlagged = !!flagged[q.attemptQuestionId];
              return (
                <div key={q.attemptQuestionId} id={`attempt-q-${i}`} className={cn(cardVariants(), "scroll-mt-6 p-6")}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-[#64748B]">
                      Q{i + 1}
                    </span>
                    <span className="font-mono text-xs font-medium text-[#64748B]">
                      {TYPE_LABEL[q.questionType] ?? q.questionType} · {q.defaultPoints} pts
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleFlag(q.attemptQuestionId)}
                      aria-label={isFlagged ? `Unflag question ${i + 1}` : `Flag question ${i + 1}`}
                      aria-pressed={isFlagged}
                      className={cn(
                        "ml-auto inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
                        isFlagged
                          ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                          : "border-[#E2E8F0] text-[#94A3B8] hover:bg-[#F1F5F9]"
                      )}
                    >
                      <FlagIcon filled={isFlagged} />
                      {isFlagged ? "Flagged" : "Flag"}
                    </button>
                  </div>
                  <h3 className="mb-4 text-sm font-semibold text-[#0F172A]">{q.content}</h3>
                  <QuestionRenderer question={q} />
                </div>
              );
            })}
          </div>

          {/* Mobile submit */}
          {submitSlot && <div className="mt-6 lg:hidden">{submitSlot}</div>}

          <p className="mt-6 text-center text-xs text-[#94A3B8]">
            Answers are saved automatically.
          </p>
        </div>

        {/* Sidebar: timer + navigator + submit */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-6 space-y-4">
            {/* Timer */}
            <div
              className={cn(
                "rounded-xl border p-4 text-center",
                expired
                  ? "border-[#E2E8F0] bg-[#F1F5F9]"
                  : remainingMs < 300000
                  ? "border-[#0052FF]/30 bg-[#0052FF]/5"
                  : "border-[#10B981]/30 bg-[#10B981]/5"
              )}
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Time remaining</p>
              <p
                className={cn(
                  "mt-1 font-mono text-2xl font-bold tabular-nums",
                  expired
                    ? "text-[#94A3B8]"
                    : remainingMs < 300000
                    ? "text-[#0052FF]"
                    : "text-[#10B981]"
                )}
              >
                {formatRemaining(remainingMs)}
              </p>
              <div className="mt-2 flex items-center justify-center gap-3">
                {autosaveStatus && <AutosaveIndicator status={autosaveStatus} />}
                {wsStatus && <WsIndicator status={wsStatus} />}
              </div>
            </div>

            {/* Question navigator */}
            <div className={cn(cardVariants(), "p-4")}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">Questions</p>
                <div className="flex items-center gap-3 text-[10px] text-[#64748B]">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded border border-[#0052FF]/30 bg-[#0052FF]/5" />
                    done
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10" />
                    flag
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {sorted.map((q, i) => {
                  const isAnswered = !!answers[q.attemptQuestionId]?.payload;
                  const isFlagged = !!flagged[q.attemptQuestionId];
                  return (
                    <button
                      key={q.attemptQuestionId}
                      type="button"
                      onClick={() => scrollToQuestion(i)}
                      aria-label={`Jump to question ${i + 1}`}
                      className={cn(
                        "flex h-10 items-center justify-center rounded-lg border text-xs font-bold transition-all duration-150 hover:scale-105",
                        isFlagged
                          ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                          : isAnswered
                          ? "border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]"
                          : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F1F5F9]"
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit button */}
            {submitSlot}
          </div>
        </aside>
      </div>
    </div>
  );
}

function WsIndicator({ status }: { status: "connecting" | "connected" | "disconnected" }) {
  const config = {
    connected: { label: "Live", tone: "text-[#10B981]" },
    connecting: { label: "Connecting…", tone: "text-[#0052FF]" },
    disconnected: { label: "Offline", tone: "text-[#94A3B8]" },
  } as const;
  const { label, tone } = config[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-[10px] font-semibold", tone, status === "connecting" && "animate-pulse")}
    >
      ● {label}
    </span>
  );
}

function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const config: Record<AutosaveStatus, { label: string; tone: string }> = {
    idle: { label: "Saved", tone: "text-[#10B981]" },
    saving: { label: "Saving…", tone: "text-[#0052FF]" },
    saved: { label: "Saved", tone: "text-[#10B981]" },
    error: { label: "Save failed", tone: "text-[#64748B]" },
    blocked: { label: "Saving stopped", tone: "text-[#94A3B8]" },
  };
  const { label, tone } = config[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-[10px] font-semibold", tone, status === "saving" && "animate-pulse")}
    >
      ● {label}
    </span>
  );
}
