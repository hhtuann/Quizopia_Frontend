import type { LocalQuestion } from "./types";

/**
 * TEACHER-ONLY answer view for a saved (snapshot-pinned) exam question.
 *
 * IMPORTANT: this component renders `answerKey` / `isCorrect` — it MUST NOT be
 * reused for student-facing UI (FE10). Student views use a separate DTO that
 * never carries the answer key.
 *
 * For SINGLE_CHOICE / MULTIPLE_CHOICE the correct options are marked inline
 * (via `option.isCorrect`). For TRUE_FALSE_MATRIX / NUMERIC_FILL the raw
 * `answerKey` JSON is shown in a <details> block (MVP — avoids deep per-type
 * parsing of a JsonNode whose shape varies).
 */
export function QuestionAnswerView({ question }: { question: LocalQuestion }) {
  if (!question.hasSnapshot) {
    return (
      <p className="pl-1 text-xs font-medium text-[#64748B]">
        Answers are pinned after you save.
      </p>
    );
  }

  if (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") {
    const options = question.options ?? [];
    if (options.length === 0) {
      return <p className="pl-1 text-xs text-[#64748B]">No options on this question.</p>;
    }
    return (
      <ul className="space-y-1.5">
        {options.map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-1.5 text-xs"
          >
            <span className="font-mono font-semibold text-[#64748B]">{o.optionKey}</span>
            <span className="text-[#0F172A]">{o.content}</span>
            {o.isCorrect === true && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#10B981]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#10B981]">
                ✓ correct
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  // TF_MATRIX / NUMERIC_FILL — show the answer-key JSON (teacher verifying).
  return (
    <details className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2">
      <summary className="cursor-pointer font-mono text-xs font-semibold text-[#0052FF]">
        Show answer key (teacher)
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-[#0F172A]">
        {JSON.stringify(question.answerKey ?? null, null, 2)}
      </pre>
    </details>
  );
}
