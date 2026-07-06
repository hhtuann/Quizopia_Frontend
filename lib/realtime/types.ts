/**
 * Realtime types — mirror backend `RealtimeEventEnvelope` (frozen §9.6).
 *
 * Backend uses `@JsonInclude(NON_NULL)`, so absent fields are simply omitted
 * (not `null`). TS marks them optional. `eventId`/`eventType`/`occurredAt`/
 * `serverTime` are always present.
 */

export type RealtimeEventType =
  | "SESSION_OPENED"
  | "SESSION_CLOSED"
  | "ATTEMPT_STARTED"
  | "ATTEMPT_SUBMITTED"
  | "ACTIVE_COUNT_CHANGED"
  | "SERVER_TIME_SYNC";

export interface RealtimeEventEnvelope {
  eventId: string;
  eventType: RealtimeEventType;
  sessionId?: number | null;
  attemptId?: number | null;
  studentProfileId?: number | null;
  occurredAt: string;
  serverTime: string;
  activeCount?: number | null;
}
