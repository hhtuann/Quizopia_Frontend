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

/** Backend nested record `ExamInfo(Long examId, String title)`. */
export interface ExamInfo {
  examId: number;
  title: string;
}

/**
 * Backend nested record `AvailableSessionItem`. `sessionStatus` is the session
 * lifecycle status (OPEN / SCHEDULED / …). Nullable: `activeAttemptId`,
 * `activeAttemptDeadlineAt`, `maxAttempts` (Integer in Java). Since Phase 1
 * Task B, `durationMinutes` is always present (NOT NULL).
 */
export interface AvailableSessionItem {
  sessionId: number;
  code: string;
  title: string;
  sessionStatus: string;
  exam: ExamInfo;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
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

/**
 * Backend record `SessionEligibilityResponse` (P2-D): server-authorized
 * pre-flight state for one shared-session deep link. `state` is one of
 * CAN_START | CAN_RESUME | NOT_YET_STARTED | NO_ATTEMPTS_LEFT |
 * ATTEMPT_EXPIRED | ENDED. Ineligible callers never see this shape (403
 * ATTEMPT_NOT_ELIGIBLE / 404 EXAM_SESSION_NOT_FOUND).
 */
export interface SessionEligibility {
  sessionId: number;
  state:
    | "CAN_START"
    | "CAN_RESUME"
    | "NOT_YET_STARTED"
    | "NO_ATTEMPTS_LEFT"
    | "ATTEMPT_EXPIRED"
    | "ENDED";
  sessionStatus: string;
  title: string;
  examTitle: string;
  visibility: "PUBLIC" | "CLASS_RESTRICTED";
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  maxAttempts: number;
  attemptsUsed: number;
  remainingAttempts: number;
  activeAttemptId: number | null;
  activeAttemptDeadlineAt: string | null;
  canStartNow: boolean;
  canResume: boolean;
  serverTime: string;
}

/** `GET /api/exam-sessions/{sessionId}/eligibility` — shared-link pre-flight. */
export function getSessionEligibility(sessionId: number): Promise<SessionEligibility> {
  return http.get<SessionEligibility>(`/api/exam-sessions/${sessionId}/eligibility`);
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
