import { http } from "./http-client";
import type { QuestionType } from "./question-banks";

/**
 * Student attempt API + types (Day 7, Student-only). Mirrors:
 *   - StartAttemptRequest / StartAttemptResponse (+ QuestionView / OptionView)
 *   - AttemptDetailResponse (+ QuestionView / OptionView / SavedAnswerView)
 *
 * Start vs Detail: Start has NO roundingInstruction, savedAnswer, submittedAt,
 * or answeredCount/totalQuestions. Detail HAS them.
 *
 * ⚠️ NO answerKey / isCorrect / correct option anywhere — these DTOs are
 * student-safe by design. Never render correct answers.
 */

/** Shared option shape (both Start + Detail OptionView: optionKey, content, position). */
export interface AttemptOptionView {
  optionKey: string;
  content: string;
  position: number | null;
}

// ============================ Start Attempt ============================

export interface StartAttemptRequest {
  clientInstanceId?: string | null;
}

export interface StartQuestionView {
  attemptQuestionId: number;
  examQuestionId: number;
  questionType: QuestionType;
  displayOrder: number | null;
  content: string;
  defaultPoints: number;
  options: AttemptOptionView[];
}

/** Backend `StartAttemptResponse` (200 resume / 201 new). */
export interface StartAttemptResponse {
  attemptId: number;
  sessionId: number;
  attemptNumber: number | null;
  status: string;
  startedAt: string;
  deadlineAt: string;
  serverTime: string;
  resumed: boolean;
  maxAttempts: number | null;
  questions: StartQuestionView[];
}

// ============================ Attempt Detail ============================

/** Backend `SavedAnswerView(JsonNode answerPayload, Long sequenceNumber)`. answerPayload is opaque. */
export interface SavedAnswerView {
  answerPayload: unknown;
  sequenceNumber: number | null;
}

export interface DetailQuestionView {
  attemptQuestionId: number;
  examQuestionId: number;
  questionType: QuestionType;
  displayOrder: number | null;
  content: string;
  defaultPoints: number;
  options: AttemptOptionView[];
  savedAnswer: SavedAnswerView | null;
}

/** Backend `AttemptDetailResponse` (GET /api/attempts/{attemptId}). */
export interface AttemptDetailResponse {
  attemptId: number;
  sessionId: number;
  attemptNumber: number | null;
  status: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  serverTime: string;
  answeredCount: number;
  totalQuestions: number;
  questions: DetailQuestionView[];
}

// ============================ Answer Payloads (4 types) ============================

export interface SingleAnswerPayload {
  selectedOptionKey: string;
}
export interface MultipleAnswerPayload {
  selectedOptionKeys: string[];
}
export interface MatrixAnswerPayload {
  responses: Record<string, boolean>;
}
export interface NumericAnswerPayload {
  value: string;
}
export type AnswerPayload =
  | SingleAnswerPayload
  | MultipleAnswerPayload
  | MatrixAnswerPayload
  | NumericAnswerPayload
  | null;

// ============================ API ============================

/** `POST /api/exam-sessions/{sessionId}/attempts` → 200 (resume) / 201 (new). */
export function startAttempt(
  sessionId: number,
  req: StartAttemptRequest = {}
): Promise<StartAttemptResponse> {
  return http.post<StartAttemptResponse>(
    `/api/exam-sessions/${sessionId}/attempts`,
    req
  );
}

/** `GET /api/attempts/{attemptId}` → attempt detail (questions + saved answers, NO answerKey). */
export function getAttemptDetail(
  attemptId: number
): Promise<AttemptDetailResponse> {
  return http.get<AttemptDetailResponse>(`/api/attempts/${attemptId}`);
}

// ============================ Autosave (FE11) ============================

/** Backend `SaveAnswerRequest`. answerPayload is JsonNode-serializable (null = clear). */
export interface SaveAnswerRequest {
  attemptQuestionId?: number | null;
  examQuestionId?: number | null;
  answerPayload: unknown;
  sequenceNumber: number;
  clientInstanceId?: string | null;
}

/** Backend `SaveAnswerResponse`. `reason` omitted when accepted=true (@JsonInclude NON_NULL). */
export interface SaveAnswerResponse {
  accepted: boolean;
  reason?: string | null;
  attemptQuestionId: number | null;
  currentSequenceNumber: number;
  savedAt: string;
  serverTime: string;
}

/** `PUT /api/attempts/{attemptId}/answers` → 200 `SaveAnswerResponse`. */
export function saveAnswer(
  attemptId: number,
  req: SaveAnswerRequest
): Promise<SaveAnswerResponse> {
  return http.put<SaveAnswerResponse>(
    `/api/attempts/${attemptId}/answers`,
    req
  );
}

// ============================ Submit (FE12) ============================

/** Backend `SubmitRequest(String submissionIdempotencyKey)`. */
export interface SubmitRequest {
  submissionIdempotencyKey: string;
}

/**
 * Backend `SubmitResponse`. `score`/`maxScore`/`percentage` are nullable
 * (null on legacy/Day-7 cached responses). On same-key retry, returns the
 * IMMUTABLE_CACHED_RESPONSE with the original frozen values.
 */
export interface SubmitResponse {
  attemptId: number;
  status: string;
  submittedAt: string;
  serverTime: string;
  attemptNumber: number | null;
  sessionId: number | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
}

/** `POST /api/attempts/{attemptId}/submit` → 200 `SubmitResponse`. */
export function submitAttempt(
  attemptId: number,
  req: SubmitRequest
): Promise<SubmitResponse> {
  return http.post<SubmitResponse>(
    `/api/attempts/${attemptId}/submit`,
    req
  );
}
