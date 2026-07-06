"use client";

import { useAnswerStore } from "@/lib/attempt/answer-store";
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
      <p className="pl-1 text-xs text-[#6B7280]">Mark each statement as True or False.</p>
      {question.options.map((opt) => {
        const current = responses[opt.optionKey];
        const answered = current !== undefined;
        return (
          <div
            key={opt.optionKey}
            className={`flex items-center gap-3 rounded-2xl bg-[#E0E5EC] px-4 py-3 shadow-inset-small ${
              answered ? "shadow-inset-deep" : ""
            }`}
          >
            <span className="rounded-inner bg-[#E0E5EC] px-1.5 py-0.5 font-mono text-xs font-bold shadow-inset-small">
              {opt.optionKey}
            </span>
            <span className="flex-1 text-sm text-[#3D4852]">{opt.content}</span>
            <div className="flex gap-1.5">
              {[
                { val: true, label: "T" },
                { val: false, label: "F" },
              ].map((btn) => {
                const active = current === btn.val;
                return (
                  <label
                    key={btn.label}
                    className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl text-xs font-bold outline-none transition-all duration-300 focus-within:ring-2 focus-within:ring-[#6C63FF] focus-within:ring-offset-2 focus-within:ring-offset-[#E0E5EC] ${
                      active
                        ? btn.val
                          ? "bg-[#E0E5EC] text-[#38B2AC] shadow-inset-deep"
                          : "bg-[#E0E5EC] text-[#6C63FF] shadow-inset-deep"
                        : "bg-[#E0E5EC] text-[#A0AEC0] shadow-extruded-small hover:text-[#3D4852]"
                    }`}
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
