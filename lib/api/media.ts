/**
 * P4-B camera/media API (issues #84–#87). Mirrors backend
 * `monitoring/api/MonitoringPreflightController` + webhook contract; see
 * docs/phase4/API_EVENT_CONTRACTS.md §3/§10 and ADR-008.
 *
 * All calls are authenticated by the shared axios instance; media tokens
 * returned here are short-lived LiveKit JWTs — never logged, never stored
 * outside memory.
 */
import { http } from "@/lib/api/http-client";

export interface PreflightResponse {
  preflightId: string;
  mediaToken: string;
  mediaTokenExpiresAt: string;
  mediaIdentity: string;
  wsUrl: string;
  roomScope: "session";
  cameraRequired: true;
  expiresAt: string;
}

export type PreflightVerifyResponse =
  | { state: "NOT_PUBLISHED" }
  | {
      state: "READY";
      readinessLease: string;
      readinessExpiresAt: string;
      verifiedCameraTrackSid: string;
    };

export interface MediaTokenResponse {
  mediaToken: string;
  mediaTokenExpiresAt: string;
  mediaIdentity: string;
  wsUrl: string;
  roomScope: "session";
}

export type CameraParticipantState =
  | "CONNECTED"
  | "RECONNECTING"
  | "IDLE"
  | "REVOKED";

export interface CameraParticipantStatus {
  mediaIdentity: string;
  userId: number;
  displayName: string | null;
  attemptId: number | null;
  state: CameraParticipantState;
  connectedSince: string | null;
  lastVerifiedAt: string | null;
}

export interface CameraStatusResponse {
  roomScope: "session";
  participants: CameraParticipantStatus[];
}

export function createCameraPreflight(sessionId: number): Promise<PreflightResponse> {
  return http.post<PreflightResponse>(
    `/api/exam-sessions/${sessionId}/monitoring/preflights`,
    { schemaVersion: 1 },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export function verifyCameraPreflight(
  sessionId: number,
  preflightId: string
): Promise<PreflightVerifyResponse> {
  return http.post<PreflightVerifyResponse>(
    `/api/exam-sessions/${sessionId}/monitoring/preflights/${preflightId}/verify`,
    { schemaVersion: 1 }
  );
}

/** Fresh media token for the caller's IN_PROGRESS attempt (renewal path). */
export function renewAttemptMediaToken(attemptId: number): Promise<MediaTokenResponse> {
  return http.post<MediaTokenResponse>(
    `/api/attempts/${attemptId}/monitoring/media-token`,
    { schemaVersion: 1 }
  );
}

/** Teacher viewer (subscribe-only) token for the session room. */
export function getTeacherMediaToken(sessionId: number): Promise<MediaTokenResponse> {
  return http.get<MediaTokenResponse>(
    `/api/exam-sessions/${sessionId}/monitoring/media-token`
  );
}

export function getCameraStatus(sessionId: number): Promise<CameraStatusResponse> {
  return http.get<CameraStatusResponse>(
    `/api/exam-sessions/${sessionId}/monitoring/camera-status`
  );
}

/** Revoke a participant's camera binding and kick them from the room. */
export function revokeCameraParticipant(
  sessionId: number,
  mediaIdentity: string
): Promise<void> {
  return http.post<void>(
    `/api/exam-sessions/${sessionId}/monitoring/participants/${mediaIdentity}/revoke`,
    { schemaVersion: 1 }
  );
}
