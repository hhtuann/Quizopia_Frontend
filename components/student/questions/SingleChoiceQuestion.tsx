"use client";

import { useAnswerStore } from "@/lib/attempt/answer-store";
import type { DetailQuestionView, SingleAnswerPayload } from "@/lib/api/student-attempt";

export function SingleChoiceQuestion({ question }: { question: DetailQuestionView }) {
  const payload = useAnswerStore(
    (s) => s.answers[question.attemptQuestionId]?.payload
  ) as SingleAnswerPayload | null | undefined;
  const setAnswer = useAnswerStore((s) => s.setAnswer);
  const selected = payload?.selectedOptionKey ?? null;

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{question.content}</legend>
      {question.options.map((opt) => {
        const active = selected === opt.optionKey;
        return (
          <label
            key={opt.optionKey}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-[#E0E5EC] px-4 py-3 shadow-inset-small outline-none transition-all duration-300 hover:shadow-inset-pressed focus-within:ring-2 focus-within:ring-[#6C63FF] focus-within:ring-offset-2 focus-within:ring-offset-[#E0E5EC] ${
              active ? "shadow-inset-deep" : ""
            }`}
          >
            <input
              type="radio"
              name={`q-${question.attemptQuestionId}`}
              value={opt.optionKey}
              checked={active}
              onChange={() =>
                setAnswer(question.attemptQuestionId, { selectedOptionKey: opt.optionKey })
              }
              className="h-4 w-4 accent-[#6C63FF]"
            />
            <span className="rounded-inner bg-[#E0E5EC] px-1.5 py-0.5 font-mono text-xs font-bold shadow-inset-small">
              {opt.optionKey}
            </span>
            <span className={`text-sm ${active ? "font-semibold text-[#6C63FF]" : "text-[#3D4852]"}`}>
              {opt.content}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
