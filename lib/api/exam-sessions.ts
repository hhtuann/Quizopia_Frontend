import { http } from "./http-client";
import type { PageResponse } from "./question-banks";

/**
 * Exam-sessions API + types (Day 6, Teacher-only). Mirrors backend records:
 *   - com.hhtuann.backend.exam.dto.ExamSessionListItem
 *   - com.hhtuann.backend.exam.dto.ExamSessionDetailResponse
 *   - com.hhtuann.backend.exam.dto.CreateExamSessionRequest
 *
 * Endpoints (ExamSessionController, prefix /api/exam-sessions):
 *   - GET  /api/exam-sessions/my        → PageResponse<ExamSessionListItem>
 *   - GET  /api/exam-sessions/{id}      → ExamSessionDetailResponse
 *   - POST /api/exam-sessions           → 201 ExamSessionDetailResponse
 * (update / schedule / open / close / cancel are FE8b.)
 */

export type ExamSessionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "CANCELLED";

/** Backend record `ExamSessionListItem`. */
export interface ExamSessionListItem {
  id: number;
  examId: number;
  examVersionNumber: number;
  code: string;
  title: string;
  status: ExamSessionStatus;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  participantCount: number;
  createdAt: string;
}

/** Backend record `ExamSessionDetailResponse`. `version` is the @Version optimistic token (used in FE8b). */
export interface ExamSessionDetailResponse {
  id: number;
  examId: number;
  examVersionNumber: number;
  code: string;
  title: string;
  status: ExamSessionStatus;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  openedAt: string | null;
  closedAt: string | null;
  participantCount: number;
  version: number | null;
  createdAt: string;
}

export interface ExamSessionListParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  status?: ExamSessionStatus;
  examId?: number;
}

/**
 * Backend record `CreateExamSessionRequest`. Client never sends `schoolId` /
 * `owner` — the backend resolves them. `examVersionNumber` MUST reference a
 * PUBLISHED version (taken from the exam editor's `publishedVersions`, never
 * the current draft). `code` is ≤ 30 (shorter than an exam code). Starts/ends
 * are ISO-8601 UTC instants.
 */
export interface CreateExamSessionRequest {
  examId: number;
  examVersionNumber: number;
  code: string;
  title: string;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
}

/** `GET /api/exam-sessions/my` — sessions owned by the caller (TEACHER). */
export function listMySessions(
  params: ExamSessionListParams = {}
): Promise<PageResponse<ExamSessionListItem>> {
  return http.get<PageResponse<ExamSessionListItem>>("/api/exam-sessions/my", {
    params,
  });
}

/** `GET /api/exam-sessions/{sessionId}` — teacher detail (read-only in FE8a). */
export function getSessionDetail(
  sessionId: number
): Promise<ExamSessionDetailResponse> {
  return http.get<ExamSessionDetailResponse>(`/api/exam-sessions/${sessionId}`);
}

/** `POST /api/exam-sessions` → 201 `ExamSessionDetailResponse`. */
export function createSession(
  req: CreateExamSessionRequest
): Promise<ExamSessionDetailResponse> {
  return http.post<ExamSessionDetailResponse>("/api/exam-sessions", req);
}

// ============================================================
// Update config + lifecycle (FE8b)
// ============================================================

/**
 * Backend `UpdateExamSessionRequest`. `expectedVersion` is the JPA `@Version`
 * optimistic token. Only `title`/`startsAt`/`endsAt`/`maxAttempts` are editable
 * — `code`/`examId`/`examVersionNumber`/owner never change after create.
 */
export interface UpdateExamSessionRequest {
  expectedVersion: number;
  title: string;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
}

/** `PUT /api/exam-sessions/{sessionId}` → 200 updated detail (config edit; DRAFT/SCHEDULED only). */
export function updateSession(
  sessionId: number,
  req: UpdateExamSessionRequest
): Promise<ExamSessionDetailResponse> {
  return http.put<ExamSessionDetailResponse>(
    `/api/exam-sessions/${sessionId}`,
    req
  );
}

/** Lifecycle actions — all return 200 `ExamSessionDetailResponse`, no body. Idempotent at the target state. */
export type SessionLifecycleAction = "schedule" | "open" | "close" | "cancel";

export function scheduleSession(
  sessionId: number
): Promise<ExamSessionDetailResponse> {
  return http.post<ExamSessionDetailResponse>(
    `/api/exam-sessions/${sessionId}/schedule`
  );
}

export function openSession(
  sessionId: number
): Promise<ExamSessionDetailResponse> {
  return http.post<ExamSessionDetailResponse>(
    `/api/exam-sessions/${sessionId}/open`
  );
}

export function closeSession(
  sessionId: number
): Promise<ExamSessionDetailResponse> {
  return http.post<ExamSessionDetailResponse>(
    `/api/exam-sessions/${sessionId}/close`
  );
}

export function cancelSession(
  sessionId: number
): Promise<ExamSessionDetailResponse> {
  return http.post<ExamSessionDetailResponse>(
    `/api/exam-sessions/${sessionId}/cancel`
  );
}
