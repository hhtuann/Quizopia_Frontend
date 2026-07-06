import type { QuestionType } from "@/lib/api/question-banks";
import type {
  ExamDraftVersionResponse,
  ExamQuestionOptionResponse,
  UpdateDraftCompositionRequest,
} from "@/lib/api/exams";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Local editable composition tree (FE7b editor). This is the client-side
 * working copy; it is rebuilt from the server draft whenever the editor query
 * refetches (initial load + after a successful save).
 *
 * `position` is NOT stored — it is implied by array order (insertion order =
 * position), and recomputed when building the PUT body.
 */
export interface LocalQuestion {
  uid: string;
  sourceQuestionId: number;
  defaultPoints: number | null; // editable; null = use the pinned default
  // Display snapshot — populated from the server (saved) OR from a bank
  // QuestionSummary (just-added, no answer snapshot yet):
  code: string;
  type: QuestionType;
  content: string;
  difficulty: string | null;
  defaultPointsServer: number | null;
  hasSnapshot: boolean; // true once the question has been saved (answer view available)
  answerKey?: unknown;
  options?: ExamQuestionOptionResponse[];
}

export interface LocalSection {
  uid: string;
  title: string;
  instructions: string;
  questions: LocalQuestion[];
}

let uidCounter = 0;
/** Stable unique id for React keys (no Math.random — deterministic counter). */
export function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/** Build the local editable tree from the server draft (sorted by position). */
export function toLocalSections(draft: ExamDraftVersionResponse): LocalSection[] {
  return draft.sections
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => ({
      uid: nextUid("sec"),
      title: s.title,
      instructions: s.instructions ?? "",
      questions: s.questions
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((q) => ({
          uid: nextUid("q"),
          sourceQuestionId: q.sourceQuestionId,
          defaultPoints: q.defaultPoints,
          code: q.questionCode,
          type: q.questionType as QuestionType,
          content: q.content,
          difficulty: q.difficulty,
          defaultPointsServer: q.defaultPoints,
          hasSnapshot: true,
          answerKey: q.answerKey,
          options: q.options,
        })),
    }));
}

/**
 * Build the PUT body. STRUCTURAL ONLY — sends `sourceQuestionId`, `position`
 * (array index), `defaultPoints`. NEVER sends snapshot fields. `position` is
 * recomputed from array order.
 */
export function toRequestBody(
  expectedVersionNumber: number,
  durationMinutes: number | null,
  instructions: string | null,
  sections: LocalSection[]
): UpdateDraftCompositionRequest {
  return {
    expectedVersionNumber,
    durationMinutes,
    instructions,
    sections: sections.map((section, sIndex) => ({
      position: sIndex,
      title: section.title.trim(),
      instructions: section.instructions.trim() ? section.instructions.trim() : null,
      questions: section.questions.map((q, qIndex) => ({
        sourceQuestionId: q.sourceQuestionId,
        position: qIndex,
        defaultPoints: q.defaultPoints,
      })),
    })),
  };
}

/** Validate the editable composition. Returns an error message or null if valid. */
export function validateComposition(sections: LocalSection[]): string | null {
  for (const section of sections) {
    if (!section.title.trim()) {
      return "Every section must have a title.";
    }
    for (const q of section.questions) {
      if (q.defaultPoints !== null && q.defaultPoints <= 0) {
        return "Default points must be positive, or empty to use the question's pinned default.";
      }
    }
  }
  return null;
}

/** Map a save error. `conflict` signals a 409 (concurrent / not-draft). */
export function describeSaveError(err: unknown): {
  conflict?: boolean;
  message: string;
} {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_CONCURRENT_MODIFICATION":
        return {
          conflict: true,
          message:
            "This draft was changed by another session. Your edits were not saved — review the updated draft and retry.",
        };
      case "EXAM_VERSION_NOT_DRAFT":
        return { conflict: true, message: "This version is no longer a draft." };
      case "EXAM_ACCESS_DENIED":
        return { message: "You don't have permission to edit this exam." };
      case "EXAM_NOT_FOUND":
        return { message: "This exam could not be found." };
      case "EXAM_VALIDATION_ERROR":
        return { message: norm.message || "Please check the highlighted fields." };
      default:
        return { message: norm.message || "Could not save the draft." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}
