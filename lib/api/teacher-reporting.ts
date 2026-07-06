import { http } from "./http-client";
import type { QuestionType } from "./question-banks";

/**
 * Teacher reporting types (Day 8). Mirrors:
 *   - com.hhtuann.backend.attempt.dto.SessionResultItem
 *   - com.hhtuann.backend.attempt.dto.SessionResultsPage (inner record)
 *   - com.hhtuann.backend.attempt.dto.SessionStatisticsResponse
 *   - com.hhtuann.backend.attempt.dto.ScoreDistributionBucket
 *   - com.hhtuann.backend.attempt.dto.QuestionStatisticsItem
 *
 * NO answerKey anywhere — only aggregate stats + scores.
 */

/** Backend `ScoreDistributionBucket(int lowerBound, int upperBound, boolean upperInclusive, int count)`. */
export interface ScoreDistributionBucket {
  lowerBound: number;
  upperBound: number;
  upperInclusive: boolean;
  count: number;
}

/** Backend `QuestionStatisticsItem`. `maxScore`/`correctRate`/`averageAwardedScore` nullable (BigDecimal). */
export interface QuestionStatisticsItem {
  examQuestionId: number;
  questionType: QuestionType;
  maxScore: number | null;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  correctRate: number | null;
  averageAwardedScore: number | null;
}

/** Backend `SessionResultItem`. `score`/`maxScore`/`percentage` nullable (BigDecimal); `submittedAt` nullable. */
export interface SessionResultItem {
  studentId: number;
  studentCode: string | null;
  displayName: string | null;
  bestAttemptId: number | null;
  attemptCount: number;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  gradeStatus: string;
}

/** Paginated results page (inner record of SessionResultService). */
export interface SessionResultsPage {
  items: SessionResultItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
  direction: string;
}

/** Backend `SessionStatisticsResponse`. Many nullable BigDecimal/Integer fields. */
export interface SessionStatisticsResponse {
  examSessionId: number;
  eligibleStudentCount: number | null;
  startedStudentCount: number;
  submittedStudentCount: number;
  gradedStudentCount: number;
  notSubmittedCount: number | null;
  totalAttemptCount: number;
  bestResultCount: number;
  averageScore: number | null;
  averagePercentage: number | null;
  minimumScore: number | null;
  maximumScore: number | null;
  medianPercentage: number | null;
  passCount: number | null;
  passRate: number | null;
  distribution: ScoreDistributionBucket[];
  perQuestionStatistics: QuestionStatisticsItem[];
}

export type ResultSort = "percentage" | "score" | "submittedAt" | "studentName" | "studentCode";
export type ResultDirection = "ASC" | "DESC";

export interface SessionResultsParams {
  page?: number;
  size?: number;
  sort?: ResultSort;
  direction?: ResultDirection;
  minPercentage?: number;
  maxPercentage?: number;
}

/** `GET /api/exam-sessions/{sessionId}/results` → paginated BEST-per-student. */
export function getSessionResults(
  sessionId: number,
  params: SessionResultsParams = {}
): Promise<SessionResultsPage> {
  return http.get<SessionResultsPage>(
    `/api/exam-sessions/${sessionId}/results`,
    { params }
  );
}

/** `GET /api/exam-sessions/{sessionId}/statistics` → BEST-based aggregates. */
export function getSessionStatistics(
  sessionId: number
): Promise<SessionStatisticsResponse> {
  return http.get<SessionStatisticsResponse>(
    `/api/exam-sessions/${sessionId}/statistics`
  );
}

/** `GET /api/exam-sessions/{sessionId}/results/export` → XLSX blob download. */
export function exportSessionResults(sessionId: number): Promise<Blob> {
  return http.get<Blob>(
    `/api/exam-sessions/${sessionId}/results/export`,
    { responseType: "blob" }
  );
}
