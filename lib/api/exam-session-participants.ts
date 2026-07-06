import { http } from "./http-client";
import type { PageResponse } from "./question-banks";

/**
 * Exam-session participants API + types (Day 6, Teacher-only). Mirrors:
 *   - com.hhtuann.backend.exam.dto.AddParticipantsRequest
 *   - com.hhtuann.backend.exam.dto.AddParticipantsResponse
 *   - com.hhtuann.backend.exam.dto.ExamSessionParticipantResponse
 *
 * Endpoints (ExamSessionParticipantController, base
 * `/api/exam-sessions/{sessionId}/participants`):
 *   - POST                → 200 AddParticipantsResponse (PARTIAL SUCCESS, not ApiError)
 *   - GET                 → PageResponse<ExamSessionParticipantResponse>
 *   - POST /{pid}/block   → 200 ExamSessionParticipantResponse (idempotent)
 *   - POST /{pid}/unblock → 200 ExamSessionParticipantResponse (idempotent)
 *
 * NOTE: there is NO student-search endpoint. Add uses raw `studentProfileIds`
 * (manual entry) — a known UX gap, accepted by the Day-6 contract.
 */

export type ParticipantStatus = "ELIGIBLE" | "BLOCKED";

/** Backend record `ExamSessionParticipantResponse`. */
export interface ExamSessionParticipantResponse {
  id: number;
  studentProfileId: number;
  studentCode: string;
  displayName: string;
  status: ParticipantStatus;
  addedAt: string;
  blockedAt: string | null;
}

/** Backend record `AddParticipantsRequest` (`@NotEmpty List<@Positive Long>`). */
export interface AddParticipantsRequest {
  studentProfileIds: number[];
}

/**
 * Backend record `AddParticipantsResponse`. Returned with HTTP 200 — even when
 * `added === 0` (all duplicated/invalid). This is a PARTIAL SUCCESS body, NOT
 * an ApiError; the three groups must be rendered distinctly.
 */
export interface AddParticipantsResponse {
  added: number;
  duplicated: number[];
  invalid: number[];
}

export interface ParticipantListParams {
  page?: number;
  size?: number;
  sort?: string;
  status?: ParticipantStatus;
}

/** `POST /api/exam-sessions/{sessionId}/participants` → 200 partial-success body. */
export function addParticipants(
  sessionId: number,
  req: AddParticipantsRequest
): Promise<AddParticipantsResponse> {
  return http.post<AddParticipantsResponse>(
    `/api/exam-sessions/${sessionId}/participants`,
    req
  );
}

/** `GET /api/exam-sessions/{sessionId}/participants` → paged list (ELIGIBLE/BLOCKED filter). */
export function listParticipants(
  sessionId: number,
  params: ParticipantListParams = {}
): Promise<PageResponse<ExamSessionParticipantResponse>> {
  return http.get<PageResponse<ExamSessionParticipantResponse>>(
    `/api/exam-sessions/${sessionId}/participants`,
    { params }
  );
}

/** `POST …/participants/{participantId}/block` → 200 (idempotent). */
export function blockParticipant(
  sessionId: number,
  participantId: number
): Promise<ExamSessionParticipantResponse> {
  return http.post<ExamSessionParticipantResponse>(
    `/api/exam-sessions/${sessionId}/participants/${participantId}/block`
  );
}

/** `POST …/participants/{participantId}/unblock` → 200 (idempotent). */
export function unblockParticipant(
  sessionId: number,
  participantId: number
): Promise<ExamSessionParticipantResponse> {
  return http.post<ExamSessionParticipantResponse>(
    `/api/exam-sessions/${sessionId}/participants/${participantId}/unblock`
  );
}
