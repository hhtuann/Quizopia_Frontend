"use client";

import { useAnswerStore } from "@/lib/attempt/answer-store";
import { cn } from "@/lib/utils/cn";
import type { DetailQuestionView, MultipleAnswerPayload } from "@/lib/api/student-attempt";

export function MultipleChoiceQuestion({ question }: { question: DetailQuestionView }) {
  const payload = useAnswerStore(
    (s) => s.answers[question.attemptQuestionId]?.payload
  ) as MultipleAnswerPayload | null | undefined;
  const setAnswer = useAnswerStore((s) => s.setAnswer);
  const selectedKeys = payload?.selectedOptionKeys ?? [];

  const toggle = (key: string) => {
    const has = selectedKeys.includes(key);
    const next = has ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key];
    next.sort(); // ascending + implicit dedup (Set not needed — filter removes)
    setAnswer(question.attemptQuestionId, { selectedOptionKeys: next });
  };

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{question.content}</legend>
      <p className="pl-1 text-xs text-[#64748B]">Select all that apply.</p>
      {question.options.map((opt) => {
        const active = selectedKeys.includes(opt.optionKey);
        return (
          <label
            key={opt.optionKey}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 outline-none transition-all duration-200 focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2",
              active
                ? "border-[#0052FF] bg-[#0052FF]/5"
                : "border-[#E2E8F0] bg-white hover:bg-[#F1F5F9]"
            )}
          >
            <input
              type="checkbox"
              checked={active}
              onChange={() => toggle(opt.optionKey)}
              className="h-4 w-4 accent-[#0052FF]"
            />
            <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs font-bold text-[#64748B]">
              {opt.optionKey}
            </span>
            <span className={cn("text-sm", active ? "font-semibold text-[#0052FF]" : "text-[#0F172A]")}>
              {opt.content}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
