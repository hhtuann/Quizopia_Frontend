"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Badge, Button, buttonVariants, cardVariants } from "@/components/ui";
import { useQuestionDetailQuery, useUpdateQuestionMutation } from "@/hooks/queries/use-questions";
import type { NormalizedApiError } from "@/lib/api";
import type { QuestionDetail } from "@/lib/api/questions";

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";
const inputClass =
  "w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE_MATRIX: "True / False",
  NUMERIC_FILL: "Numeric fill",
};

function describeError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") return norm.message || "Could not save the question.";
  if (norm?.kind === "network") return "Network error — check your connection.";
  return "Something went wrong. Please try again.";
}

export function QuestionEditor({
  questionId,
  onClose,
  onSaved,
}: {
  questionId: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { data: question, isPending } = useQuestionDetailQuery(questionId);

  if (isPending || !question) {
    return (
      <ModalShell title="Edit question" onClose={onClose}>
        <div className="py-8 text-center text-sm text-[#64748B]">Loading…</div>
      </ModalShell>
    );
  }

  return <EditForm question={question} onClose={onClose} onSaved={onSaved} />;
}

function EditForm({
  question,
  onClose,
  onSaved,
}: {
  question: QuestionDetail;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isTF = question.questionType === "TRUE_FALSE_MATRIX";
  const isSingle = question.questionType === "SINGLE_CHOICE";
  const isChoice = question.questionType === "SINGLE_CHOICE" || question.questionType === "MULTIPLE_CHOICE";
  const isNumeric = question.questionType === "NUMERIC_FILL";

  const [content, setContent] = useState(question.content);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [options, setOptions] = useState(
    (question.options ?? []).map((o) => ({ optionKey: o.optionKey, content: o.content, isCorrect: o.isCorrect === true }))
  );
  const numericExpected = (question.answerKey as { expectedAnswer?: string } | null)?.expectedAnswer ?? "";
  const [expectedAnswer, setExpectedAnswer] = useState(numericExpected);
  const [formError, setFormError] = useState<string | null>(null);
  const [valError, setValError] = useState<string | null>(null);

  const mutation = useUpdateQuestionMutation(question.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleOption = (idx: number) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, isCorrect: !o.isCorrect } : o)));
  };

  const onSubmit = async () => {
    setFormError(null);
    setValError(null);

    if (!content.trim()) { setValError("Content is required."); return; }

    if (isChoice) {
      const correctCount = options.filter((o) => o.isCorrect).length;
      if (question.questionType === "MULTIPLE_CHOICE" && correctCount < 2) {
        setValError("Multiple choice requires at least 2 correct answers."); return;
      }
      if (options.some((o) => !o.content.trim())) { setValError("All option texts are required."); return; }
    }
    if (isTF && options.some((o) => !o.content.trim())) { setValError("All statement texts are required."); return; }
    if (isNumeric && (!expectedAnswer.trim() || expectedAnswer.trim().length !== 4)) {
      setValError("Expected answer must be exactly 4 characters."); return;
    }

    try {
      await mutation.mutateAsync({
        content: content.trim(),
        difficulty,
        explanation: explanation.trim() || null,
        options: isNumeric ? null : options.map((o) => ({ optionKey: o.optionKey, content: o.content.trim(), isCorrect: o.isCorrect })),
        expectedAnswer: isNumeric ? expectedAnswer.trim() : null,
      });
      onSaved("Question updated.");
    } catch (err) {
      setFormError(describeError(err));
    }
  };

  return (
    <ModalShell title={`Edit ${TYPE_LABEL[question.questionType] ?? "question"}`} onClose={onClose}>
      {formError && (
        <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">{formError}</div>
      )}
      {valError && (
        <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">{valError}</div>
      )}

      <div className="space-y-4">
        {/* Type (read-only) */}
        <div className="flex items-center gap-2">
          <Badge variant="accent">{TYPE_LABEL[question.questionType] ?? question.questionType}</Badge>
          <span className="text-xs text-[#64748B]">Type cannot be changed</span>
        </div>

        {/* Content */}
        <div>
          <label className={labelClass}>Question content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={cn(inputClass, "min-h-[80px] resize-y")}
            rows={3}
          />
        </div>

        {/* Difficulty */}
        <div>
          <label className={labelClass}>Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className={cn(inputClass, "h-11")}>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>

        {/* Options (choice / TF) */}
        {(isChoice || isTF) && (
          <div className="space-y-2">
            <label className={labelClass}>{isTF ? "Statements (True/False)" : "Options"}</label>
            {options.map((opt, idx) => (
              <div key={opt.optionKey} className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F1F5F9] font-mono text-xs font-semibold text-[#64748B]">{opt.optionKey}</span>
                <input
                  type="text"
                  value={opt.content}
                  onChange={(e) => setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, content: e.target.value } : o)))}
                  className={cn(inputClass, "h-10")}
                  placeholder={isTF ? `Statement ${opt.optionKey}` : `Option ${opt.optionKey}`}
                />
                {isTF ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, isCorrect: true } : o)))}
                      className={cn("rounded-md border px-3 py-1.5 text-xs font-bold transition-colors", opt.isCorrect ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]" : "border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]")}
                    >True</button>
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, isCorrect: false } : o)))}
                      className={cn("rounded-md border px-3 py-1.5 text-xs font-bold transition-colors", !opt.isCorrect ? "border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]" : "border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]")}
                    >False</button>
                  </div>
                ) : isSingle ? (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 px-2">
                    <input
                      type="radio"
                      name="single-correct"
                      checked={opt.isCorrect}
                      onChange={() => setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === idx })))}
                      className="h-4 w-4 accent-[#0052FF]"
                    />
                    <span className="text-xs font-semibold text-[#64748B]">Correct</span>
                  </label>
                ) : (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 px-2">
                    <input type="checkbox" checked={opt.isCorrect} onChange={() => toggleOption(idx)} className="h-4 w-4 accent-[#0052FF]" />
                    <span className="text-xs font-semibold text-[#64748B]">Correct</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Numeric expected answer */}
        {isNumeric && (
          <div>
            <label className={labelClass}>Expected answer (exactly 4 characters)</label>
            <input
              type="text"
              value={expectedAnswer}
              onChange={(e) => setExpectedAnswer(e.target.value)}
              maxLength={4}
              className={cn(inputClass, "h-11 max-w-[200px] text-center font-mono text-lg")}
              placeholder="1.00"
            />
          </div>
        )}

        {/* Explanation */}
        <div>
          <label className={labelClass}>Explanation <span className="font-normal normal-case text-[#64748B]/60">(optional)</span></label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className={cn(inputClass, "min-h-[60px] resize-y")}
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>Cancel</button>
          <Button type="button" onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={cn(cardVariants({ variant: "elevated" }), "relative max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] outline-none transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
