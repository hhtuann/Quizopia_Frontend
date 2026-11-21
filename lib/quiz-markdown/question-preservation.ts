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
 * Deterministic before/after preservation check. Renumbering-safe: questions
 * are matched by content signature, not by number. Appended questions count
 * as additions and never block preservation.
 */
export function assessQuestionPreservation(
  beforeSource: string,
  afterSource: string,
): QuestionPreservation {
  const before = analyzeQuizMarkdown(beforeSource).questions;
  const after = analyzeQuizMarkdown(afterSource).questions;
  const beforeSignatures = before.map(signatureOf);
  const afterSignatures = after.map(signatureOf);

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
