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
      <p className="pl-1 text-xs font-medium text-[#6B7280]">
        Answers are pinned after you save.
      </p>
    );
  }

  if (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") {
    const options = question.options ?? [];
    if (options.length === 0) {
      return <p className="pl-1 text-xs text-[#6B7280]">No options on this question.</p>;
    }
    return (
      <ul className="space-y-1.5">
        {options.map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-2 rounded-inner bg-[#E0E5EC] px-3 py-1.5 text-xs shadow-inset-small"
          >
            <span className="font-mono font-semibold text-[#6B7280]">{o.optionKey}</span>
            <span className="text-[#3D4852]">{o.content}</span>
            {o.isCorrect === true && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#E0E5EC] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#38B2AC] shadow-inset-small">
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
    <details className="rounded-inner bg-[#E0E5EC] px-3 py-2 shadow-inset-small">
      <summary className="cursor-pointer text-xs font-semibold text-[#6C63FF]">
        Show answer key (teacher)
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-inner bg-[#E0E5EC] p-2 text-xs text-[#3D4852] shadow-inset-pressed">
        {JSON.stringify(question.answerKey ?? null, null, 2)}
      </pre>
    </details>
  );
}
