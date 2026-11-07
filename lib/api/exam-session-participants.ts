import { http } from "./http-client";
import type { PageResponse } from "./question-banks";

/**
 * Exam-session participants API + types (Teacher-only). Mirrors:
 *   - com.hhtuann.backend.exam.dto.ExamSessionParticipantResponse
 *
 * Endpoints (ExamSessionParticipantController, base
 * `/api/exam-sessions/{sessionId}/participants`):
 *   - GET                 → PageResponse<ExamSessionParticipantResponse>
 *   - POST /{pid}/block   → 200 ExamSessionParticipantResponse (idempotent)
 *   - POST /{pid}/unblock → 200 ExamSessionParticipantResponse (idempotent)
 */

export type ParticipantStatus = "ELIGIBLE" | "BLOCKED";

/**
 * Backend record `ExamSessionParticipantResponse` (user-based since V17,
 * issue #4 P0-R9): `userId` is the primary identity; `studentProfileId`/
 * `studentCode` are legacy provenance — nullable for profile-less
 * participants.
 */
export interface ExamSessionParticipantResponse {
  id: number;
  userId: number | null;
  studentProfileId: number | null;
  studentCode: string | null;
  displayName: string;
  status: ParticipantStatus;
  addedAt: string;
  blockedAt: string | null;
}

export interface ParticipantListParams {
  page?: number;
  size?: number;
  sort?: string;
  status?: ParticipantStatus;
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
