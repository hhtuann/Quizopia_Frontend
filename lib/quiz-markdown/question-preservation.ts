import { analyzeQuizMarkdown } from "./quiz-markdown";

/**
 * Question-preservation assessment for AI change sets (Quizopia_System
 * #121 UX-06, gate review round 3 P1-2).
 *
 * A syntactically valid candidate is NOT proof that the model retained the
 * teacher's existing questions: "add 5 questions" can return a document with
 * only the 5 new ones, and "edit Q3" can silently rewrite Q1/Q2. This module
 * compares the BEFORE and AFTER documents with the authoritative Quiz
 * Markdown parser and answers one question deterministically:
 *
 *   Does every question that existed before still exist after — with its
 *   stem, options (letters + correctness) and answer intact — allowing for
 *   renumbering and appended new questions?
 *
 * Pure functions; no DOM; Vietnamese-safe (string comparison only).
 */

/** Normalized signature of one question, independent of its number. */
export interface QuestionSignature {
  /** Question type marker (SINGLE_CHOICE, …) — a type flip changes grading
   * semantics and must count as a rewrite, not a preservation. */
  readonly type: string;
  /** Lowercased, whitespace-collapsed stem. */
  readonly stem: string;
  /** Options in order: label + content + correctness. */
  readonly options: readonly string[];
  readonly numericAnswer: string | null;
  readonly explanation: string | null;
}

export interface QuestionPreservation {
  /** True when every before-question survives in the after-document. */
  readonly preserved: boolean;
  /** How many before-questions are missing or modified in after. */
  readonly lostCount: number;
  /** How many questions exist only in the after-document (additions). */
  readonly addedCount: number;
  /** Missing/modified question numbers (before-numbering), for the UI. */
  readonly lostQuestionNumbers: readonly number[];
}

function signatureOf(question: {
  readonly explanation: string | null;
  readonly numericAnswer: string | null;
  readonly options: readonly { readonly content: string; readonly correct: boolean; readonly label: string }[];
  readonly stem: string;
  readonly type: string;
}): QuestionSignature {
  const collapse = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  return {
    type: question.type,
    stem: collapse(question.stem),
    options: question.options.map(
      (option) => `${option.label}:${collapse(option.content)}:${option.correct ? "1" : "0"}`,
    ),
    numericAnswer: question.numericAnswer,
    explanation:
      question.explanation === null ? null : collapse(question.explanation),
  };
}

function sameQuestion(a: QuestionSignature, b: QuestionSignature): boolean {
  return (
    a.type === b.type &&
    a.stem === b.stem &&
    a.numericAnswer === b.numericAnswer &&
    a.explanation === b.explanation &&
    a.options.length === b.options.length &&
    a.options.every((option, index) => option === b.options[index])
  );
}

/**
 * True when the source contains non-whitespace text on lines no parsed
 * question covers. Coverage model (mirrors the parser): question i covers
 * its header line through the line before question i+1's header — trailing
 * free text folds into the previous question — so uncovered content is
 * text BEFORE the first question header. (Malformed mid-document headers
 * are detected separately via parser diagnostics.)
 */
function hasUncoveredContent(
  source: string,
  questions: readonly { readonly source: { readonly line: number } }[],
): boolean {
  if (questions.length === 0) {
    // No questions at all: any non-whitespace text is uncovered (the
    // caller already checked hasDraftText).
    return source.trim().length > 0;
  }
  const lines = source.split(/\r\n|\r|\n/);
  const firstHeaderLine = questions[0].source.line;
  for (let i = 0; i < firstHeaderLine - 1 && i < lines.length; i += 1) {
    if (lines[i].trim().length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic before/after preservation check. Renumbering-safe: questions
 * are matched by content signature, not by number. Appended questions count
 * as additions and never block preservation.
 *
 * FAIL-CLOSED for content the parser cannot represent (gate review rounds
 * 4/5): preservation can only be PROVEN for text the parser folded into
 * parsed questions. When the before-source has non-whitespace content that
 * no parsed question covers — a draft with zero complete questions
 * (incomplete header, plain notes), a free-text note BEFORE the first
 * question, or a malformed question header mid-document — the assessment
 * reports not-preserved so the change set demands explicit Review/Keep
 * instead of auto-applying over the teacher's text. Empty/whitespace-only
 * editors remain fully auto-applicable.
 */
export function assessQuestionPreservation(
  beforeSource: string,
  afterSource: string,
): QuestionPreservation {
  const beforeAnalysis = analyzeQuizMarkdown(beforeSource);
  const before = beforeAnalysis.questions;
  const after = analyzeQuizMarkdown(afterSource).questions;
  const beforeSignatures = before.map(signatureOf);
  const afterSignatures = after.map(signatureOf);

  // Unparsed-content guard: non-whitespace before-text that no parsed
  // question covers (before the first header), or a header-like line the
  // parser rejected (MALFORMED_QUESTION_HEADER), cannot be verified.
  const hasDraftText = beforeSource.trim().length > 0;
  const hasMalformedHeader = beforeAnalysis.diagnostics.some(
    (diagnostic) => diagnostic.code === "MALFORMED_QUESTION_HEADER",
  );
  if (hasDraftText && (hasMalformedHeader || hasUncoveredContent(beforeSource, before))) {
    return {
      preserved: false,
      lostCount: 0,
      addedCount: afterSignatures.length,
      lostQuestionNumbers: [],
    };
  }

  // Multiset matching: each after-question can satisfy at most one
  // before-question (duplicate identical questions must ALL survive —
  // dropping one copy is a loss), and unmatched after-questions count as
  // additions (an AI duplicating an existing question is an addition, not
  // a no-op).
  const consumed = new Array<boolean>(afterSignatures.length).fill(false);
  const lostQuestionNumbers: number[] = [];
  for (let i = 0; i < beforeSignatures.length; i += 1) {
    const signature = beforeSignatures[i];
    const match = afterSignatures.findIndex(
      (candidate, index) => !consumed[index] && sameQuestion(signature, candidate),
    );
    if (match === -1) {
      lostQuestionNumbers.push(before[i].number);
    } else {
      consumed[match] = true;
    }
  }
  const addedCount = consumed.filter((used) => !used).length;

  return {
    preserved: lostQuestionNumbers.length === 0,
    lostCount: lostQuestionNumbers.length,
    addedCount,
    lostQuestionNumbers,
  };
}
