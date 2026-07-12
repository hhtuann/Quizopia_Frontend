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

/** A group of questions that share the same section title (null = ungrouped). */
interface SectionGroup {
  title: string | null;
  instructions: string | null;
  items: { q: DetailQuestionView; flatIndex: number }[];
}

/** Groups a flat sorted question array into sections by `sectionTitle`. */
function groupBySection(sorted: DetailQuestionView[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const q = sorted[i];
    const key = q.sectionTitle ?? null;
    if (!current || current.title !== key) {
      current = { title: key, instructions: q.sectionInstructions ?? null, items: [] };
      groups.push(current);
    }
    current.items.push({ q, flatIndex: i });
  }
  return groups;
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
  onExpire,
  studentName,
}: {
  detail: AttemptDetailResponse;
  autosaveStatus?: AutosaveStatus;
  submitSlot?: ReactNode;
  liveServerTime?: string | null;
  wsStatus?: "connecting" | "connected" | "disconnected";
  onExpire?: () => void;
  studentName?: string;
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
  const sections = groupBySection(sorted);
  const hasSections = sections.length > 1 || (sections.length === 1 && sections[0].title !== null);
  const expired = remainingMs <= 0;

  // Fire onExpire exactly once when the timer hits 0.
  const [wasExpired, setWasExpired] = useState(false);
  useEffect(() => {
    if (expired && !wasExpired) {
      setWasExpired(true);
      onExpire?.();
    }
  }, [expired, wasExpired, onExpire]);

  const scrollToQuestion = (index: number) => {
    document.getElementById(`attempt-q-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    // Fullscreen overlay — hides the AppShell (sidebar/footer/nav).
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#FAFAFA]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ===== Sticky top navbar ===== */}
      <div className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          {/* Left: exam title + student name */}
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold tracking-tight text-[#0F172A] sm:text-lg">
              {detail.examTitle || "Exam"}
            </h1>
            {studentName && (
              <p className="truncate text-xs font-medium text-[#64748B]">{studentName}</p>
            )}
          </div>
          {/* Right: timer + indicators + submit */}
          <div className="flex items-center gap-4">
            {/* Timer */}
            <div className="text-right">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#64748B]">
                Time remaining
              </p>
              <p
                className={cn(
                  "font-mono text-lg font-bold tabular-nums leading-tight sm:text-xl",
                  expired
                    ? "text-[#94A3B8]"
                    : remainingMs < 300000
                    ? "text-[#0052FF]"
                    : "text-[#10B981]"
                )}
              >
                {formatRemaining(remainingMs)}
              </p>
              <div className="flex items-center justify-end gap-2">
                {autosaveStatus && <AutosaveIndicator status={autosaveStatus} />}
                {wsStatus && <WsIndicator status={wsStatus} />}
              </div>
            </div>
            {/* Submit */}
            {submitSlot}
          </div>
        </div>
      </div>

      {/* ===== Main content area ===== */}
      <div className="mx-auto flex max-w-6xl gap-6 p-6">
        {/* Main column: section-grouped questions */}
        <div className="min-w-0 flex-1">
          {expired && (
            <div role="alert" className="mb-6 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]">
              Time has expired.
            </div>
          )}

          {/* Questions — grouped by section if section data exists */}
          <div className="space-y-6">
            {sections.map((section, sIndex) => (
              <div key={sIndex}>
                {/* Section header (only when section titles exist) */}
                {hasSections && section.title && (
                  <div className="mb-3 rounded-lg border border-[#0052FF]/20 bg-[#0052FF]/5 px-4 py-3">
                    <h2 className="font-display text-sm font-bold tracking-tight text-[#0052FF]">
                      {section.title}
                    </h2>
                    {section.instructions && (
                      <p className="mt-1 text-xs font-medium text-[#64748B]">
                        {section.instructions}
                      </p>
                    )}
                  </div>
                )}

                {/* Questions in this section */}
                <div className="space-y-6">
                  {section.items.map(({ q, flatIndex }) => {
                    const isFlagged = !!flagged[q.attemptQuestionId];
                    return (
                      <div
                        key={q.attemptQuestionId}
                        id={`attempt-q-${flatIndex}`}
                        className={cn(cardVariants(), "scroll-mt-24 p-6")}
                      >
                        <div className="mb-4 flex items-center gap-2">
                          <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-[#64748B]">
                            Q{flatIndex + 1}
                          </span>
                          <span className="font-mono text-xs font-medium text-[#64748B]">
                            {TYPE_LABEL[q.questionType] ?? q.questionType} · {q.defaultPoints} pts
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleFlag(q.attemptQuestionId)}
                            aria-label={isFlagged ? `Unflag question ${flatIndex + 1}` : `Flag question ${flatIndex + 1}`}
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
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-[#94A3B8]">
            Answers are saved automatically.
          </p>
        </div>

        {/* Sidebar: question navigator only */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            {/* Question navigator */}
            <div className={cn(cardVariants(), "p-4")}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Questions
                </p>
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
