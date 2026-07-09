"use client";

import { useAnswerStore } from "@/lib/attempt/answer-store";
import { cn } from "@/lib/utils/cn";
import type { DetailQuestionView, MatrixAnswerPayload } from "@/lib/api/student-attempt";

export function TrueFalseMatrixQuestion({ question }: { question: DetailQuestionView }) {
  const payload = useAnswerStore(
    (s) => s.answers[question.attemptQuestionId]?.payload
  ) as MatrixAnswerPayload | null | undefined;
  const setAnswer = useAnswerStore((s) => s.setAnswer);
  const responses = payload?.responses ?? {};

  const setResponse = (key: string, value: boolean) => {
    setAnswer(question.attemptQuestionId, {
      responses: { ...responses, [key]: value },
    });
  };

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{question.content}</legend>
      <p className="pl-1 text-xs text-[#64748B]">Mark each statement as True or False.</p>
      {question.options.map((opt) => {
        const current = responses[opt.optionKey];
        const answered = current !== undefined;
        return (
          <div
            key={opt.optionKey}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3",
              answered ? "border-[#0052FF]/30 bg-[#0052FF]/5" : "border-[#E2E8F0] bg-white"
            )}
          >
            <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs font-bold text-[#64748B]">
              {opt.optionKey}
            </span>
            <span className="flex-1 text-sm text-[#0F172A]">{opt.content}</span>
            <div className="flex gap-1.5">
              {[
                { val: true, label: "T" },
                { val: false, label: "F" },
              ].map((btn) => {
                const active = current === btn.val;
                return (
                  <label
                    key={btn.label}
                    className={cn(
                      "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border text-xs font-bold outline-none transition-all duration-200 focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2",
                      active
                        ? btn.val
                          ? "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]"
                          : "border-[#0052FF]/30 bg-[#0052FF]/10 text-[#0052FF]"
                        : "border-[#E2E8F0] bg-white text-[#94A3B8] hover:text-[#0F172A]"
                    )}
                  >
                    <input
                      type="radio"
                      name={`tf-${question.attemptQuestionId}-${opt.optionKey}`}
                      checked={active}
                      onChange={() => setResponse(opt.optionKey, btn.val)}
                      className="sr-only"
                    />
                    {btn.label}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
