import { http } from "./http-client";
import { extractAxiosError, type NormalizedApiError } from "./errors";

/**
 * Monitoring API + types (Phase 4-A). Mirrors backend records:
 *   - com.quizopia.backend.monitoring.dto.ActivityEventBatchRequest/Response
 *   - com.quizopia.backend.monitoring.dto.AttemptTimelineResponse
 *   - com.quizopia.backend.monitoring.dto.AnswerHistoryResponse
 *
 * Endpoints (AttemptActivityController):
 *   - POST /api/attempts/{attemptId}/activity-events → 200 batch result
 *   - GET  /api/attempts/{attemptId}/timeline         → cursor-paged timeline
 *   - GET  /api/attempts/{attemptId}/answer-history    → accepted answer versions
 *
 * Telemetry ingest is fire-and-forget from the client's perspective — it MUST
 * never block or delay autosave (separate endpoint, no shared await).
 */

// ============================================================
// Session monitoring policy (request block on create/update)
// ============================================================

/**
 * Optional `monitoring` block on `CreateExamSessionRequest` /
 * `UpdateExamSessionRequest`. NULL/absent on update = NO CHANGE; non-null
 * replaces the whole block (the config form always sends every flag).
 * `cameraRequired` is DERIVED server-side (= monitoringEnabled) and is
 * never client-set.
 */
export interface MonitoringPolicyPayload {
  monitoringEnabled?: boolean;
  aiDetectionEnabled?: boolean;
  activityTrackingEnabled?: boolean;
  evidenceSnapshotsEnabled?: boolean;
  fullRecordingEnabled?: boolean;
  evidenceClipsEnabled?: boolean;
}

/** Backend record `MonitoringPolicyResponse` (session detail's `monitoring`). */
export interface MonitoringPolicyResponse {
  monitoringEnabled: boolean;
  /** DERIVED = monitoringEnabled. Display-only, never client-set. */
  cameraRequired: boolean;
  aiDetectionEnabled: boolean;
  activityTrackingEnabled: boolean;
  evidenceSnapshotsEnabled: boolean;
  fullRecordingEnabled: boolean;
  evidenceClipsEnabled: boolean;
  /** Not DRAFT/SCHEDULED, OR SCHEDULED past startsAt, OR any attempt exists. */
  configurationFrozen: boolean;
  mediaRetentionDays: number;
  activityRetentionDays: number;
}

// ============================================================
// Activity event ingest
// ============================================================

/** The CLIENT-emittable event types (P4-A frozen set). Server types (ATTEMPT_*, ANSWER_ACCEPTED) are rejected from clients. */
export const CLIENT_ACTIVITY_EVENT_TYPES = [
  "ANSWER_SELECTED",
  "ANSWER_CHANGED",
  "ANSWER_CLEARED",
  "QUESTION_NAVIGATED",
  "QUESTION_FLAGGED",
  "QUESTION_UNFLAGGED",
  "AUTOSAVE_FAILED",
  "TAB_HIDDEN",
  "TAB_VISIBLE",
  "WINDOW_FOCUS_LOST",
  "WINDOW_FOCUS_GAINED",
  "PAGE_RELOADED",
  "CONNECTION_LOST",
  "CONNECTION_RESTORED",
] as const;

export type ClientActivityEventType =
  (typeof CLIENT_ACTIVITY_EVENT_TYPES)[number];

export function isClientActivityEventType(x: string): x is ClientActivityEventType {
  return (CLIENT_ACTIVITY_EVENT_TYPES as readonly string[]).includes(x);
}

/** One queued client event. `eventId` is the idempotency key (client UUID). */
export interface ActivityEventInput {
  eventId: string;
  eventType: ClientActivityEventType;
  /** ISO instant — stored verbatim (clock skew retained server-side). */
  clientOccurredAt: string;
  /** Monotonic per attempt+clientInstanceId, >= 0. */
  clientSequence: number;
  clientInstanceId?: string;
  /** <= 2KB serialized. NO answer payloads/tokens. */
  metadata?: Record<string, unknown>;
}

/** Backend record `ActivityEventBatchResponse`. */
export interface IngestActivityEventsResponse {
  acceptedCount: number;
  duplicateCount: number;
  results: Array<{ eventId: string; status: "ACCEPTED" | "DUPLICATE" }>;
}

/** `POST /api/attempts/{attemptId}/activity-events` — batch of 1..25 events. */
export function ingestActivityEvents(
  attemptId: number,
  events: ActivityEventInput[]
): Promise<IngestActivityEventsResponse> {
  return http.post<IngestActivityEventsResponse>(
    `/api/attempts/${attemptId}/activity-events`,
    { events }
  );
}

/**
 * Extract the `Retry-After` seconds from a 429 MONITORING_RATE_LIMITED
 * normalized error (header lives on the raw AxiosError). Returns null when
 * absent or unparseable.
 */
export function retryAfterSeconds(err: unknown): number | null {
  const norm = err as NormalizedApiError | undefined;
  const axiosErr = norm ? extractAxiosError(norm) : undefined;
  const header = axiosErr?.response?.headers?.["retry-after"];
  if (header == null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

// ============================================================
// Timeline
// ============================================================

/** Backend record `AttemptTimelineResponse.TimelineItem`. */
export interface AttemptTimelineItem {
  eventId: string;
  eventType: string;
  source: "CLIENT" | "SERVER";
  clientOccurredAt: string | null;
  clientSequence: number | null;
  /** ORDERING KEY (chronological, ascending). */
  serverReceivedAt: string;
  metadata: Record<string, unknown> | null;
}

/** Timeline query params (all optional; built via {@link buildTimelineParams}). */
export interface AttemptTimelineParams {
  cursor?: string;
  /** 1..100, default 50. */
  limit?: number;
  types?: string[];
  source?: "CLIENT" | "SERVER";
  from?: string;
  to?: string;
}

/** Backend record `AttemptTimelineResponse`. */
export interface AttemptTimelineResponse {
  attemptId: number;
  items: AttemptTimelineItem[];
  /** null = last page. */
  nextCursor: string | null;
  serverTime: string;
}

/**
 * Pure param builder (tested): drops empty values so axios omits them, joins
 * the comma-separated `types` list, and clamps `limit` to the server window.
 */
export function buildTimelineParams(
  params: AttemptTimelineParams = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  if (params.cursor) out.cursor = params.cursor;
  if (params.limit != null && Number.isFinite(params.limit)) {
    out.limit = String(Math.min(100, Math.max(1, Math.round(params.limit))));
  }
  const types = params.types?.filter((t) => t.length > 0) ?? [];
  if (types.length > 0) out.types = types.join(",");
  if (params.source) out.source = params.source;
  if (params.from) out.from = params.from;
  if (params.to) out.to = params.to;
  return out;
}

/** `GET /api/attempts/{attemptId}/timeline` — cursor-paged unified timeline. */
export function getAttemptTimeline(
  attemptId: number,
  params: AttemptTimelineParams = {}
): Promise<AttemptTimelineResponse> {
  return http.get<AttemptTimelineResponse>(
    `/api/attempts/${attemptId}/timeline`,
    { params: buildTimelineParams(params) }
  );
}

// ============================================================
// Answer history
// ============================================================

/** Backend record `AnswerHistoryResponse.AnswerHistoryItem`. */
export interface AnswerHistoryItem {
  attemptQuestionId: number;
  acceptedSequence: number;
  answerPayload: unknown;
  acceptedAt: string;
}

/** Backend record `AnswerHistoryResponse`. */
export interface AnswerHistoryResponse {
  attemptId: number;
  totalCount: number;
  items: AnswerHistoryItem[];
}

/** `GET /api/attempts/{attemptId}/answer-history` — accepted answer versions. */
export function getAnswerHistory(
  attemptId: number,
  attemptQuestionId?: number
): Promise<AnswerHistoryResponse> {
  const params =
    attemptQuestionId != null ? { attemptQuestionId } : undefined;
  return http.get<AnswerHistoryResponse>(
    `/api/attempts/${attemptId}/answer-history`,
    { params }
  );
}

/** Backend record `SessionAttemptsResponse.Item`. */
export interface SessionAttemptItem {
  attemptId: number;
  userId: number;
  attemptNumber: number;
  status: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
}

/**
 * `GET /api/exam-sessions/{sessionId}/attempts` (P4-A4 #83): every attempt of
 * the session INCLUDING in-progress ones — the teacher Activity-panel picker
 * source (the graded best-results report misses live attempts).
 */
export function getSessionAttempts(
  sessionId: number
): Promise<{ sessionId: number; attempts: SessionAttemptItem[] }> {
  return http.get(`/api/exam-sessions/${sessionId}/attempts`);
}
