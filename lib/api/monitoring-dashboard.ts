/**
 * P4-E unified monitoring dashboard API (design §3.1/§3.2). Mirrors backend
 * `SessionMonitoringDashboardController`: read-time overview KPIs + cursor-
 * paged participant rollups. REST is the source of truth — STOMP pings
 * invalidate these keys and TanStack refetches.
 */
import { http } from "@/lib/api/http-client";
import type { AlertReviewStatus } from "@/lib/api/alert-review";

/** Backend record `MonitoringOverviewResponse` (§3.1). */
export interface MonitoringOverviewResponse {
  sessionId: number;
  asOf: string;
  monitoringEnabled: boolean;
  attempts: {
    total: number;
    inProgress: number;
    submitted: number;
    graded: number;
  };
  camera: {
    policyRequired: boolean;
    /** Open transport connection (presence), per user. */
    connected: number;
    /** Connected AND a verified published track (F04). */
    publishing: number;
    reconnecting: number;
    idle: number;
    revoked: number;
  };
  ai: {
    enabled: boolean;
    openAlerts: number;
    closedAlerts: number;
    unreviewedAlerts: number;
    lastDetectionAt: string | null;
  };
  recording: {
    fullRecordingEnabled: boolean;
    rollingBufferActive: boolean;
    activeJobs: number;
    completeJobs: number;
    failedJobs: number;
  };
  evidence: {
    available: number;
    partial: number;
    pending: number;
    failed: number;
    expired: number;
  };
}

/** Camera binding state on a participant row — `NONE` = never bound at all
 * (honest absence, distinct from IDLE). */
export type ParticipantCameraState =
  | "CONNECTED"
  | "RECONNECTING"
  | "IDLE"
  | "REVOKED"
  | "NONE";

/** Backend record `MonitoringParticipantsResponse.Item` (§3.2). */
export interface MonitoringParticipantItem {
  attemptId: number;
  userId: number;
  displayName: string;
  attemptNumber: number;
  attemptStatus: string;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  lastActivityAt: string | null;
  camera: {
    state: ParticipantCameraState;
    connectedSince: string | null;
    lastVerifiedAt: string | null;
    mediaIdentity: string | null;
    /** F04: verified published track on the open connection. */
    publishing: boolean;
    /** F04: transport presence (open connection) — distinct from publishing. */
    online: boolean;
  };
  ai: {
    /** F04: session policy flag — false ⇒ the AI block is disabled. */
    enabled: boolean;
    lastDetectionAt: string | null;
    openAlerts: number;
    totalAlerts: number;
    unreviewedAlerts: number;
    /** F04: raw accepted detections — separate from alerts. */
    detections: number;
    /** F04: quarantined (late/dup) — honest degraded signal. */
    quarantined: number;
  };
  recording: {
    mode: "FULL" | "ROLLING" | "NONE";
    activeJobs: number;
    completeJobs: number;
    failedJobs: number;
  };
  evidence: {
    snapshots: number;
    clips: number;
  };
  reviewStatus: AlertReviewStatus;
}

/** Backend record `MonitoringParticipantsResponse` (§3.2). */
export interface MonitoringParticipantsResponse {
  sessionId: number;
  items: MonitoringParticipantItem[];
  /** Opaque numeric cursor (last attemptId, DESC) — null = last page. */
  nextCursor: string | null;
  /**
   * F04: honestly "NOT_AVAILABLE" — the backend cannot observe which camera
   * the TEACHER's browser subscribes to (client-side LiveKit state).
   */
  teacherSubscriptionState: "NOT_AVAILABLE";
}

/** Participants query params — `"ALL"` selects are dropped by the builder. */
export interface ParticipantsQueryFilters {
  status: "ALL" | "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  cameraState: "ALL" | ParticipantCameraState;
  reviewStatus: "ALL" | AlertReviewStatus;
}

export const DEFAULT_PARTICIPANTS_FILTERS: ParticipantsQueryFilters = {
  status: "ALL",
  cameraState: "ALL",
  reviewStatus: "ALL",
};

/**
 * Pure param builder (tested): filters → query string, dropping `"ALL"`
 * sentinels so the backend only sees concrete filter values.
 */
export function buildParticipantsParams(
  filters: ParticipantsQueryFilters,
  cursor?: string | number,
  limit?: number
): Record<string, string> {
  const params: Record<string, string> = {};
  if (cursor != null) params.cursor = String(cursor);
  if (limit != null) params.limit = String(limit);
  if (filters.status !== "ALL") params.status = filters.status;
  if (filters.cameraState !== "ALL") params.cameraState = filters.cameraState;
  if (filters.reviewStatus !== "ALL") params.reviewStatus = filters.reviewStatus;
  return params;
}

/** `GET /api/exam-sessions/{sessionId}/monitoring/overview` (§3.1). */
export function getMonitoringOverview(
  sessionId: number
): Promise<MonitoringOverviewResponse> {
  return http.get(`/api/exam-sessions/${sessionId}/monitoring/overview`);
}

/** `GET /api/exam-sessions/{sessionId}/monitoring/participants` (§3.2). */
export function getMonitoringParticipants(
  sessionId: number,
  filters: ParticipantsQueryFilters = DEFAULT_PARTICIPANTS_FILTERS,
  cursor?: string | number,
  limit?: number
): Promise<MonitoringParticipantsResponse> {
  const qs = new URLSearchParams(
    buildParticipantsParams(filters, cursor, limit)
  ).toString();
  return http.get(
    `/api/exam-sessions/${sessionId}/monitoring/participants${qs ? `?${qs}` : ""}`
  );
}
