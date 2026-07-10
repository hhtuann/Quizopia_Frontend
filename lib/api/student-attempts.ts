import { http } from "./http-client";

/**
 * Student attempt API + types (Day 7, Student-only). Mirrors backend records:
 *   - com.hhtuann.backend.attempt.dto.AvailableSessionsResponse
 *     (+ nested AvailableSessionItem / ExamInfo)
 *   - com.hhtuann.backend.attempt.dto.MyAttemptsResponse
 *     (+ nested MyAttemptListItem)
 *
 * Endpoints:
 *   - GET /api/exam-sessions/available → AvailableSessionsResponse (NOT paged)
 *   - GET /api/attempts/my?page&size    → MyAttemptsResponse (paged shape)
 *
 * ⚠️ Field is `sessionStatus` (NOT `status` — the Day-7 contract §8.1 example
 * is outdated; the Java record is authoritative). `serverTime` is top-level on
 * AvailableSessionsResponse.
 */

/** Backend nested record `ExamInfo(Long examId, String title, String subjectName)`. */
export interface ExamInfo {
  examId: number;
  title: string;
  subjectName: string;
}

/**
 * Backend nested record `AvailableSessionItem`. `sessionStatus` is the session
 * lifecycle status (OPEN / SCHEDULED / …). Nullable: `activeAttemptId`,
 * `activeAttemptDeadlineAt`, `durationMinutes`, `maxAttempts` (Integer in Java).
 */
export interface AvailableSessionItem {
  sessionId: number;
  code: string;
  title: string;
  sessionStatus: string;
  exam: ExamInfo;
  startsAt: string;
  endsAt: string;
  durationMinutes: number | null;
  maxAttempts: number | null;
  attemptsUsed: number;
  remainingAttempts: number;
  activeAttemptId: number | null;
  activeAttemptDeadlineAt: string | null;
  canStartNow: boolean;
  canResume: boolean;
}

/** Backend record `AvailableSessionsResponse(items, serverTime)` — NOT a PageResponse. */
export interface AvailableSessionsResponse {
  items: AvailableSessionItem[];
  serverTime: string;
}

export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "GRADED";

/** Backend nested record `MyAttemptListItem`. Nullable: attemptNumber, submittedAt, deadlineAt. */
export interface MyAttemptListItem {
  attemptId: number;
  sessionId: number;
  sessionCode: string;
  sessionTitle: string;
  attemptNumber: number | null;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  deadlineAt: string | null;
  createdAt: string;
  score: number | null;
  maxScore: number | null;
}

/** Backend record `MyAttemptsResponse` (paged shape, fixed sort `createdAt: DESC`). */
export interface MyAttemptsResponse {
  items: MyAttemptListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** `GET /api/exam-sessions/available` — sessions the caller (STUDENT) can see. */
export function getAvailableSessions(): Promise<AvailableSessionsResponse> {
  return http.get<AvailableSessionsResponse>("/api/exam-sessions/available");
}

/** `GET /api/attempts/my?page=&size=` — paginated own-attempt history. */
export function getMyAttempts(page = 0, size = 20): Promise<MyAttemptsResponse> {
  return http.get<MyAttemptsResponse>("/api/attempts/my", {
    params: { page, size },
  });
}
