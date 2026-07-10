import type { LocalQuestion } from "./types";

/**
 * TEACHER-ONLY answer view for a saved (snapshot-pinned) exam question.
 *
 * IMPORTANT: this component renders `answerKey` / `isCorrect` — it MUST NOT be
 * reused for student-facing UI (FE10). Student views use a separate DTO that
 * never carries the answer key.
 *
 * SINGLE_CHOICE / MULTIPLE_CHOICE mark the correct option(s) inline.
 * TRUE_FALSE_MATRIX renders the 4 statements with their True/False value
 * (from `option.isCorrect`). NUMERIC_FILL shows just the `expectedAnswer`.
 */
export function QuestionAnswerView({ question }: { question: LocalQuestion }) {
  if (!question.hasSnapshot) {
    return (
      <p className="pl-1 text-xs font-medium text-[#64748B]">
        Answers are pinned after you save.
      </p>
    );
  }

  if (question.type === "NUMERIC_FILL") {
    const expected = readExpectedAnswer(question.answerKey);
    return (
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2 text-xs">
        <span className="font-mono uppercase tracking-wide text-[#64748B]">Expected answer </span>
        <code className="font-mono font-bold text-[#0052FF]">{expected ?? "—"}</code>
      </div>
    );
  }

  // SINGLE_CHOICE / MULTIPLE_CHOICE / TRUE_FALSE_MATRIX — render options.
  const options = question.options ?? [];
  if (options.length === 0) {
    return <p className="pl-1 text-xs text-[#64748B]">No options on this question.</p>;
  }
  const isTrueFalse = question.type === "TRUE_FALSE_MATRIX";
  return (
    <ul className="space-y-1.5">
      {options.map((o) => {
        const correct = o.isCorrect === true;
        return (
          <li
            key={o.id}
            className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-1.5 text-xs"
          >
            <span className="font-mono font-semibold text-[#64748B]">{o.optionKey}</span>
            <span className="text-[#0F172A]">{o.content}</span>
            {isTrueFalse ? (
              <span
                className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  correct
                    ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
                    : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
                }`}
              >
                {correct ? "True" : "False"}
              </span>
            ) : correct ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#10B981]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#10B981]">
                ✓ correct
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Reads the NUMERIC_FILL `expectedAnswer` string from the opaque answerKey JSON. */
function readExpectedAnswer(answerKey: unknown): string | undefined {
  if (answerKey && typeof answerKey === "object" && "expectedAnswer" in answerKey) {
    const value = (answerKey as { expectedAnswer?: unknown }).expectedAnswer;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}
