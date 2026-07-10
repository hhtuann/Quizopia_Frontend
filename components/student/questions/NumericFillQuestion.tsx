"use client";

import { useAnswerStore } from "@/lib/attempt/answer-store";
import { cn } from "@/lib/utils/cn";
import type { DetailQuestionView, NumericAnswerPayload } from "@/lib/api/student-attempt";

/**
 * NUMERIC_FILL renderer — STRICT invariants:
 * - `<input type="text">` (NOT type="number").
 * - `maxLength={4}`.
 * - Value is a RAW STRING. NO parseFloat, Number(), toFixed, Math.round, or trim.
 * - The backend grades by EXACT string equality (1.00 != 1); the FE preserves
 *   the exact representation the student typed (the rounding hint lives in the
 *   question content, never the expectedAnswer).
 */
export function NumericFillQuestion({ question }: { question: DetailQuestionView }) {
  const payload = useAnswerStore(
    (s) => s.answers[question.attemptQuestionId]?.payload
  ) as NumericAnswerPayload | null | undefined;
  const setAnswer = useAnswerStore((s) => s.setAnswer);

  // Raw string from the store — no transformation.
  const value = payload?.value ?? "";

  return (
    <div>
      <label
        htmlFor={`numeric-${question.attemptQuestionId}`}
        className="sr-only"
      >
        {question.content}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={`numeric-${question.attemptQuestionId}`}
          type="text"
          inputMode="decimal"
          maxLength={4}
          value={value}
          onChange={(e) =>
            setAnswer(question.attemptQuestionId, { value: e.target.value })
          }
          placeholder="____"
          className="h-12 w-32 rounded-lg border border-[#E2E8F0] bg-transparent px-4 text-center font-mono text-lg text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
        />
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            value.length === 4 ? "text-[#10B981]" : "text-[#94A3B8]"
          )}
        >
          {value.length}/4
        </span>
      </div>
    </div>
  );
}
