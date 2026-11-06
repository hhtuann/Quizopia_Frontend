import type { QuizMarkdownAnalysis } from "./quiz-markdown";

/**
 * Question Bank import contract (Quizopia_System issue #10, resolved P2-C).
 *
 * The Quiz Markdown grammar itself stays donor-pure: MULTIPLE_CHOICE accepts
 * a single starred option and NUMERIC_FILL accepts four-character tokens such
 * as `-.50`. The Question Bank, however, refuses such questions at edit and
 * Exam-publish time. This module mirrors — exactly — the backend
 * `MarkdownQuestionImportService.bankContractErrors` preflight so the teacher
 * import UI can surface those conflicts BEFORE the confirm action; the
 * backend re-checks authoritatively before persisting (never trusts the
 * client).
 *
 * Canonical NUMERIC_FILL answer: exactly 4 characters matching
 * `^-?[0-9]+([.][0-9]+)?$` (a digit must precede the decimal point).
 */
export const BANK_NUMERIC_PATTERN = /^-?[0-9]+([.][0-9]+)?$/;

/** Mirror of the backend `RowError` for a bank-contract violation. */
export interface BankContractViolation {
  /** Question number in the Markdown document (1-based). */
  readonly questionNumber: number;
  /** Source line of the question header (1-based) for the diagnostics list. */
  readonly line: number;
  /** Source column of the question header (always 1 — the marker start). */
  readonly column: number;
  readonly field: "correctAnswers" | "expectedAnswer";
  readonly code: "MULTIPLE_CHOICE_MIN_TWO_CORRECT" | "NUMERIC_ANSWER_BANK_CONTRACT";
  readonly message: string;
}

export function bankContractViolations(
  analysis: QuizMarkdownAnalysis
): readonly BankContractViolation[] {
  const violations: BankContractViolation[] = [];
  for (const question of analysis.questions) {
    if (question.type === "MULTIPLE_CHOICE") {
      const correct = question.options.filter((o) => o.correct).length;
      if (correct < 2) {
        violations.push({
          questionNumber: question.number,
          line: question.source.line,
          column: 1,
          field: "correctAnswers",
          code: "MULTIPLE_CHOICE_MIN_TWO_CORRECT",
          message:
            `Question ${question.number}: MULTIPLE_CHOICE requires at least 2 correct options — ` +
            "mark them with '*' (single-correct questions must use SINGLE_CHOICE).",
        });
      }
    } else if (
      question.type === "NUMERIC_FILL" &&
      question.numericAnswer !== null &&
      !BANK_NUMERIC_PATTERN.test(question.numericAnswer)
    ) {
      violations.push({
        questionNumber: question.number,
        line: question.source.line,
        column: 1,
        field: "expectedAnswer",
        code: "NUMERIC_ANSWER_BANK_CONTRACT",
        message:
          `Question ${question.number}: numeric answer '${question.numericAnswer}' is not accepted by the ` +
          "Question Bank contract — write a digit before the decimal point (e.g. '-0.5', not '-.5'). " +
          "The answer is stored verbatim and is never rewritten.",
      });
    }
  }
  return violations;
}
