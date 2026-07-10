import { http } from "./http-client";

/**
 * Question-bank API + types (Day 5, Teacher-only).
 *
 * Types mirror the backend records field-for-field (verified against):
 *   - com.hhtuann.backend.question.dto.QuestionBankListItem
 *   - com.hhtuann.backend.question.dto.QuestionSummary
 *   - com.hhtuann.backend.question.dto.SubjectSummary
 *   - com.hhtuann.backend.question.dto.PageResponse
 * and the domain enums QuestionType / QuestionStatus (Difficulty per Day-5
 * contract §15). QuestionSummary NEVER carries answerKey/expectedAnswer.
 *
 * Endpoints (QuestionBankController, prefix /api/question-banks):
 *   - GET /api/question-banks/my
 *   - GET /api/question-banks/{bankId}/questions
 * (POST create + import are out of FE5 scope.)
 */

/** The 4 MVP question types (DB CHECK accepts exactly these). */
export type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE_MATRIX"
  | "NUMERIC_FILL";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestionStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Backend record `SubjectSummary(Long id, String code, String name)`. */
export interface SubjectSummary {
  id: number;
  code: string;
  name: string;
}

/**
 * Backend record `QuestionBankListItem`. Note: the real record carries
 * `description` and `status` (the FE5 task spec omitted them); both are mirrored
 * here. `status` is a backend String — its enum values are not enumerated
 * client-side, so it is typed as `string`.
 */
export interface QuestionBankListItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  subject: SubjectSummary;
  questionCount: number;
  status: string;
  createdAt: string;
}

/** Backend record `QuestionSummary`. Never exposes answerKey/expectedAnswer. */
export interface QuestionSummary {
  id: number;
  code: string;
  currentVersionNumber: number | null;
  questionType: QuestionType;
  content: string;
  difficulty: Difficulty;
  defaultPoints: number;
  status: QuestionStatus;
  createdAt: string;
}

/** Backend record `PageResponse<T>` (Spring Data, 0-based page). */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

export interface BankListParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  subjectId?: number;
}

export interface BankQuestionListParams {
  page?: number;
  size?: number;
  type?: QuestionType;
  search?: string;
  status?: QuestionStatus;
}

/** `GET /api/question-banks/my` — list banks owned by the caller (TEACHER). */
export function listMyBanks(
  params: BankListParams = {}
): Promise<PageResponse<QuestionBankListItem>> {
  return http.get<PageResponse<QuestionBankListItem>>(
    "/api/question-banks/my",
    { params }
  );
}

/** `GET /api/question-banks/{bankId}/questions` — list questions in a bank. */
export function listBankQuestions(
  bankId: number,
  params: BankQuestionListParams = {}
): Promise<PageResponse<QuestionSummary>> {
  return http.get<PageResponse<QuestionSummary>>(
    `/api/question-banks/${bankId}/questions`,
    { params }
  );
}

// ============================================================
// POST /api/question-banks (create)
// ============================================================

/**
 * Backend record `CreateQuestionBankRequest`. The client NEVER sends
 * `schoolId` or `ownerTeacherId` — the backend resolves them from the
 * authenticated teacher profile.
 */
export interface CreateQuestionBankRequest {
  name: string;
  description: string | null;
  subjectId: number;
}

/** Backend record `QuestionBankResponse` (201 Created). */
export interface QuestionBankResponse {
  id: number;
  code: string;
  name: string;
  description: string | null;
  subject: SubjectSummary;
  questionCount: number;
  createdAt: string;
}

/** `POST /api/question-banks` → 201 `QuestionBankResponse`. */
export function createBank(
  req: CreateQuestionBankRequest
): Promise<QuestionBankResponse> {
  return http.post<QuestionBankResponse>("/api/question-banks", req);
}
