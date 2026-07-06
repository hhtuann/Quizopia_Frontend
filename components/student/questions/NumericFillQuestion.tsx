"use client";

import { useAnswerStore } from "@/lib/attempt/answer-store";
import type { DetailQuestionView, NumericAnswerPayload } from "@/lib/api/student-attempt";

/**
 * NUMERIC_FILL renderer — STRICT invariants:
 * - `<input type="text">` (NOT type="number").
 * - `maxLength={4}`.
 * - Value is a RAW STRING. NO parseFloat, Number(), toFixed, Math.round, or trim.
 * - The backend grades via `BigDecimal.compareTo == 0` after normalizing
 *   comma→dot; the FE preserves the exact representation the student typed.
 * - `roundingInstruction` is shown (never the expectedAnswer).
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
          className="h-12 w-32 rounded-button bg-[#E0E5EC] px-4 text-center font-mono text-lg text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300"
        />
        <span
          className={`text-xs font-semibold tabular-nums ${
            value.length === 4 ? "text-[#38B2AC]" : "text-[#A0AEC0]"
          }`}
        >
          {value.length}/4
        </span>
      </div>
      {question.roundingInstruction && (
        <p className="mt-2 rounded-2xl bg-[#E0E5EC] px-4 py-2 text-xs font-medium text-[#6B7280] shadow-inset-small">
          {question.roundingInstruction}
        </p>
      )}
    </div>
  );
}
