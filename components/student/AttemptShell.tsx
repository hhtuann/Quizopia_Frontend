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

/**
 * The attempt-taking shell: timer (deadline snapshot + client tick), progress
 * (answered/total), and the question list (each rendered by type). NO submit
 * button (FE12) and NO autosave (FE11) — answers live in the in-memory
 * answer-store only and are lost on unmount until FE11.
 */
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
  /** Latest server time from SERVER_TIME_SYNC (WS). Null when WS not connected. */
  liveServerTime?: string | null;
  /** WS connection status for the indicator. */
  wsStatus?: "connecting" | "connected" | "disconnected";
}) {
  // Hydrate the answer store from the server detail on load.
  const hydrate = useAnswerStore((s) => s.hydrate);
  useEffect(() => {
    hydrate(detail.questions);
  }, [detail, hydrate]);

  // Timer: track the "server now" in epoch ms. When WS connected, liveServerTime
  // keeps it accurate; when disconnected, local tick provides smooth fallback.
  const deadlineMs = new Date(detail.deadlineAt).getTime();
  const [nowMs, setNowMs] = useState(() =>
    new Date(liveServerTime ?? detail.serverTime).getTime()
  );

  // Adjust state when liveServerTime changes (WS sync) — "adjust on prop change" pattern.
  const [prevLive, setPrevLive] = useState(liveServerTime);
  if (liveServerTime !== prevLive) {
    setPrevLive(liveServerTime);
    if (liveServerTime) setNowMs(new Date(liveServerTime).getTime());
  }

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const sorted = [...detail.questions].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );
  const expired = remainingMs <= 0;

  return (
    <div>
      {/* Status bar: timer + progress + attempt info */}
      <div className={cn(cardVariants(), "mb-6 flex flex-wrap items-center gap-4 p-4")}>
        <div
          role="timer"
          aria-live="off"
          className={cn(
            "rounded-lg border px-3 py-1.5 font-mono text-sm font-bold tabular-nums",
            expired
              ? "border-[#E2E8F0] bg-[#F1F5F9] text-[#94A3B8]"
              : remainingMs < 300000
              ? "border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]"
              : "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
          )}
        >
          ⏱ {formatRemaining(remainingMs)}
        </div>
        <div role="status" className="text-sm font-medium text-[#64748B]">
          {detail.answeredCount} / {detail.totalQuestions} answered
        </div>
        {autosaveStatus && <AutosaveIndicator status={autosaveStatus} />}
        {wsStatus && <WsIndicator status={wsStatus} />}
        <div className="ml-auto text-xs font-medium text-[#64748B]">
          Attempt #{detail.attemptNumber ?? "—"} · {detail.status.replace("_", " ")}
        </div>
      </div>

      {expired && (
        <div role="alert" className="mb-6 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]">
          Time has expired. Submitting will be handled automatically once the feature is wired.
        </div>
      )}

      {/* Questions */}
      <div className="space-y-6">
        {sorted.map((q, i) => (
          <div key={q.attemptQuestionId} className={cn(cardVariants(), "p-6")}>
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-[#64748B]">
                Q{i + 1}
              </span>
              <span className="font-mono text-xs font-medium text-[#64748B]">
                {TYPE_LABEL[q.questionType] ?? q.questionType} · {q.defaultPoints} pts
              </span>
            </div>
            <h3 className="mb-4 text-sm font-semibold text-[#0F172A]">{q.content}</h3>
            <QuestionRenderer question={q} />
          </div>
        ))}
      </div>

      {submitSlot && <div className="mt-6">{submitSlot}</div>}

      <p className="mt-6 text-center text-xs text-[#94A3B8]">
        Answers are saved automatically.
      </p>
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
      className={cn("text-xs font-semibold", tone, status === "connecting" && "animate-pulse")}
    >
      ● {label}
    </span>
  );
}

function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const config: Record<AutosaveStatus, { label: string; tone: string }> = {
    idle: { label: "All changes saved", tone: "text-[#10B981]" },
    saving: { label: "Saving…", tone: "text-[#0052FF]" },
    saved: { label: "Saved", tone: "text-[#10B981]" },
    error: { label: "Save failed — will retry", tone: "text-[#64748B]" },
    blocked: { label: "Saving stopped — exam over or submitted", tone: "text-[#94A3B8]" },
  };
  const { label, tone } = config[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-xs font-semibold", tone, status === "saving" && "animate-pulse")}
    >
      {label}
    </span>
  );
}
