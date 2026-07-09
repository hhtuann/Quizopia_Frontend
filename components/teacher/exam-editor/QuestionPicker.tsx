"use client";

import { useMemo, useState } from "react";
import { useQuestionBanksQuery, useBankQuestionsQuery } from "@/hooks/queries/use-question-banks";
import { Button, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { nextUid, type LocalQuestion } from "./types";

const selectClass =
  "h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE_MATRIX: "True/False",
  NUMERIC_FILL: "Numeric",
};

/**
 * Question picker — reuses the FE5 bank/question hooks
 * (`useQuestionBanksQuery`, `useBankQuestionsQuery`). Lets the teacher pick
 * `sourceQuestionId`s from their own banks. The picker returns ONLY the
 * sourceQuestionId (+ display snapshot from the bank summary); snapshot
 * content/answerKey are resolved + pinned by the backend on save.
 */
export function QuestionPicker({
  onAdd,
  excludeSourceIds,
  onClose,
}: {
  onAdd: (questions: LocalQuestion[]) => void;
  excludeSourceIds: number[];
  onClose: () => void;
}) {
  const [bankId, setBankId] = useState<number | "">("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const excluded = useMemo(() => new Set(excludeSourceIds), [excludeSourceIds]);

  const { data: banksData, isPending: banksPending } = useQuestionBanksQuery({ size: 100 });
  const banks = banksData?.items ?? [];

  const enabled = bankId !== "";
  const { data: questionsData, isPending: questionsPending } = useBankQuestionsQuery(
    enabled ? bankId : 0,
    { size: 100 },
    enabled
  );
  const questions = questionsData?.items ?? [];

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const toAdd: LocalQuestion[] = questions
      .filter((q) => selected.has(q.id) && !excluded.has(q.id))
      .map((q) => ({
        uid: nextUid("q"),
        sourceQuestionId: q.id,
        defaultPoints: null,
        code: q.code,
        type: q.questionType,
        content: q.content,
        difficulty: q.difficulty,
        defaultPointsServer: q.defaultPoints,
        hasSnapshot: false,
      }));
    if (toAdd.length > 0) onAdd(toAdd);
    onClose();
  };

  return (
    <div className={cn(cardVariants(), "p-5")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          Add questions from a bank
        </p>
        <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Close
        </button>
      </div>

      <label htmlFor="picker-bank" className="sr-only">
        Choose a question bank
      </label>
      <select
        id="picker-bank"
        value={bankId}
        onChange={(e) => {
          setBankId(e.target.value === "" ? "" : Number(e.target.value));
          setSelected(new Set());
        }}
        disabled={banksPending}
        className={cn(selectClass, "mb-4")}
      >
        <option value="">{banksPending ? "Loading banks…" : "Select a bank…"}</option>
        {banks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code} — {b.name}
          </option>
        ))}
      </select>

      {!enabled ? (
        <p className="pl-1 text-xs text-[#64748B]">Pick a bank to see its questions.</p>
      ) : questionsPending ? (
        <p role="status" className="pl-1 text-xs text-[#64748B]">
          Loading questions…
        </p>
      ) : questions.length === 0 ? (
        <p className="pl-1 text-xs text-[#64748B]">This bank has no questions.</p>
      ) : (
        <ul className="mb-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          {questions.map((q) => {
            const isExcluded = excluded.has(q.id);
            const checked = selected.has(q.id);
            return (
              <li key={q.id}>
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm",
                    isExcluded ? "opacity-50" : "cursor-pointer hover:bg-[#F1F5F9]"
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={isExcluded}
                    checked={checked}
                    onChange={() => toggle(q.id)}
                    className="mt-1 h-4 w-4 accent-[#0052FF]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] text-[#64748B]">
                        {q.code}
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                        {TYPE_LABEL[q.questionType] ?? q.questionType}
                      </span>
                      {isExcluded && (
                        <span className="text-[10px] font-medium text-[#64748B]">
                          (already added)
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-[#0F172A]">{q.content}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </button>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={selected.size === 0}
        >
          Add {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      </div>
    </div>
  );
}
