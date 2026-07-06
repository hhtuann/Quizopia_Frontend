import { http } from "./http-client";
import type { QuestionType } from "./question-banks";

/**
 * Student result types (Day 8). Mirrors:
 *   - com.hhtuann.backend.attempt.dto.AttemptResultResponse
 *   - com.hhtuann.backend.attempt.dto.QuestionResultView
 *
 * ⚠️ NO answerKey — `correct` is the grading OUTCOME (pass/fail), NOT the
 * correct answer. No answer-key fields anywhere.
 */

/** Backend `QuestionResultView`. `awardedScore`/`maxScore` are nullable (BigDecimal in Java). */
export interface QuestionResultView {
  attemptQuestionId: number;
  examQuestionId: number;
  questionType: QuestionType;
  awardedScore: number | null;
  maxScore: number | null;
  correct: boolean;
  answered: boolean;
}

/** Backend `AttemptResultResponse`. `score`/`maxScore`/`percentage` nullable (not-yet-graded / legacy). */
export interface AttemptResultResponse {
  attemptId: number;
  examSessionId: number;
  status: string;
  submittedAt: string | null;
  gradedAt: string | null;
  gradeStatus: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  isBest: boolean;
  attemptCount: number;
  questionResults: QuestionResultView[];
}

/** `GET /api/attempts/{attemptId}/result` → own result (grading summary + per-question). */
export function getAttemptResult(
  attemptId: number
): Promise<AttemptResultResponse> {
  return http.get<AttemptResultResponse>(`/api/attempts/${attemptId}/result`);
}

/** `GET /api/exam-sessions/{sessionId}/results/me/best` → own BEST result (null if none). */
export function getMyBestResult(
  sessionId: number
): Promise<AttemptResultResponse | null> {
  return http.get<AttemptResultResponse | null>(
    `/api/exam-sessions/${sessionId}/results/me/best`
  );
}
