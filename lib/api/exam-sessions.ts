import { http } from "./http-client";
import type { MonitoringPolicyPayload, MonitoringPolicyResponse } from "./monitoring";
import type { PageResponse } from "./question-banks";

/**
 * Exam-sessions API + types (Phase 1, Task B). Mirrors backend records:
 *   - com.quizopia.backend.exam.dto.ExamSessionListItem
 *   - com.quizopia.backend.exam.dto.ExamSessionDetailResponse
 *   - com.quizopia.backend.exam.dto.CreateExamSessionRequest
 *
 * Canonical nested routes (ExamSessionNestedController):
 *   - GET  /api/exams/{examId}/sessions            → PageResponse<ExamSessionListItem>
 *   - POST /api/exams/{examId}/sessions            → 201 ExamSessionDetailResponse
 * Legacy flat routes (/api/exam-sessions/*) still work with the same payloads
 * and are used for session-scoped detail/actions by sessionId — deprecated.
 *
 * One exam = one published content set, so there is NO version selection:
 * session creation requires the exam to be PUBLISHED (409
 * EXAM_SESSION_NOT_PUBLISHED_EXAM otherwise).
 */

export type ExamSessionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "CANCELLED";

/** Backend `SessionVisibility`. PUBLIC = all Quizopia students; CLASS_RESTRICTED = assigned classes only. */
export type SessionVisibility = "PUBLIC" | "CLASS_RESTRICTED";

/** Backend record `ExamSessionListItem` (no examVersionNumber anymore). */
export interface ExamSessionListItem {
  id: number;
  examId: number;
  code: string;
  title: string;
  status: ExamSessionStatus;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  participantCount: number;
  createdAt: string;
}

/** Backend record `ExamSessionDetailResponse`. `version` is the @Version optimistic token. `durationMinutes` is always set now. P4-A adds the derived `monitoring` policy block. */
export interface ExamSessionDetailResponse {
  id: number;
  examId: number;
  examCode: string | null;
  code: string;
  title: string;
  status: ExamSessionStatus;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  durationMinutes: number;
  openedAt: string | null;
  closedAt: string | null;
  participantCount: number;
  version: number | null;
  createdAt: string;
  visibility: SessionVisibility;
  /** Monitoring policy (P4-A). Server always sends it; kept optional for older cached payloads. */
  monitoring?: MonitoringPolicyResponse;
}

export interface ExamSessionListParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  status?: ExamSessionStatus;
}

/**
 * Backend record `CreateExamSessionRequest` (NO examVersionNumber). The exam
 * must be PUBLISHED. `code` is ≤ 30 (shorter than an exam code). Starts/ends
 * are ISO-8601 UTC instants. `durationMinutes` NULL = prefill from the exam's
 * editor-metadata default; 0 = unlimited.
 */
export interface CreateExamSessionRequest {
  examId: number;
  code?: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  durationMinutes?: number | null;
  /** PUBLIC = all Quizopia students; CLASS_RESTRICTED (default) = assigned classes only. */
  visibility?: SessionVisibility;
  /** Classrooms assigned when CLASS_RESTRICTED. Ignored when PUBLIC. */
  classroomIds?: number[];
  /** Monitoring policy block (P4-A). Absent = all flags OFF. */
  monitoring?: MonitoringPolicyPayload;
}

/** `GET /api/exams/{examId}/sessions` — sessions of ONE exam (canonical nested route). */
export function listExamSessions(
  examId: number,
  params: ExamSessionListParams = {}
): Promise<PageResponse<ExamSessionListItem>> {
  return http.get<PageResponse<ExamSessionListItem>>(
    `/api/exams/${examId}/sessions`,
    { params }
  );
}

/** `GET /api/exam-sessions/my` — sessions owned by the caller (legacy flat route). */
export function listMySessions(
  params: ExamSessionListParams = {}
): Promise<PageResponse<ExamSessionListItem>> {
  return http.get<PageResponse<ExamSessionListItem>>("/api/exam-sessions/my", {
    params,
  });
}

/** `GET /api/exam-sessions/{sessionId}` — teacher detail (legacy flat route, by sessionId). */
export function getSessionDetail(
  sessionId: number
): Promise<ExamSessionDetailResponse> {
  return http.get<ExamSessionDetailResponse>(`/api/exam-sessions/${sessionId}`);
}

/** `POST /api/exams/{examId}/sessions` → 201 `ExamSessionDetailResponse` (canonical nested route). */
export function createExamSession(
  examId: number,
  req: Omit<CreateExamSessionRequest, "examId">
): Promise<ExamSessionDetailResponse> {
  return http.post<ExamSessionDetailResponse>(
    `/api/exams/${examId}/sessions`,
    req
  );
}

// ============================================================
// Class assignment (visibility = CLASS_RESTRICTED)
// ============================================================

/** Backend record `SessionClassesResponse.ClassSummary`. */
export interface SessionClassSummary {
  id: number;
  code: string;
  name: string;
}

/** Backend record `SessionClassesResponse` (GET/PUT .../classes). */
export interface SessionClassesResponse {
  items: SessionClassSummary[];
}

/** Body for `PUT .../classes` — REPLACE semantics (clears old, sets new). */
export interface AssignSessionClassesRequest {
  classroomIds: number[];
}

/** `PUT /api/exam-sessions/{sessionId}/classes` → SessionClassesResponse (replace). */
export function assignSessionClasses(
  sessionId: number,
  classroomIds: number[]
): Promise<SessionClassesResponse> {
  return http.put<SessionClassesResponse>(
    `/api/exam-sessions/${sessionId}/classes`,
    { classroomIds }
  );
}

/** `GET /api/exam-sessions/{sessionId}/classes` → SessionClassesResponse. */
export function getSessionClasses(
  sessionId: number
): Promise<SessionClassesResponse> {
  return http.get<SessionClassesResponse>(
    `/api/exam-sessions/${sessionId}/classes`
  );
}

// ============================================================
// Update config + lifecycle (legacy flat routes, by sessionId)
// ============================================================

/**
 * Backend `UpdateExamSessionRequest`. `expectedVersion` is the JPA `@Version`
 * optimistic token. Only `title`/`startsAt`/`endsAt`/`maxAttempts` are
 * editable — `code`/`examId`/owner never change after create.
 */
export interface UpdateExamSessionRequest {
  expectedVersion: number;
  title: string;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  /**
   * Monitoring policy block (P4-A): NULL/absent = NO CHANGE (legacy
   * title-only edits keep working); non-null replaces the whole block —
   * the config form always sends every flag.
   */
  monitoring?: MonitoringPolicyPayload | null;
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

// ============================================================
// Roster (GET /api/exam-sessions/{sessionId}/roster)
// ============================================================

/**
 * Backend record `SessionRosterItem` — effective student roster (class members
 * ∪ participants). User-based; `studentProfileId` is the legacy profile id
 * kept for realtime-event correlation (may be null for members without a
 * profile — they cannot start attempts).
 */
export interface SessionRosterItem {
  userId: number;
  studentProfileId: number | null;
  studentCode: string | null;
  displayName: string;
}

/** `GET /api/exam-sessions/{sessionId}/roster` — flat roster for resolving studentProfileId → code + name. */
export function getSessionRoster(sessionId: number): Promise<SessionRosterItem[]> {
  return http.get<SessionRosterItem[]>(`/api/exam-sessions/${sessionId}/roster`);
}
