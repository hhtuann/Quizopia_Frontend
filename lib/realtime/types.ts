/**
 * Realtime types — mirror backend `RealtimeEventEnvelope` (frozen §9.6,
 * user-based identity per issue #4 P0-R4).
 *
 * Backend uses `@JsonInclude(NON_NULL)`, so absent fields are simply omitted
 * (not `null`). TS marks them optional. `eventId`/`eventType`/`occurredAt`/
 * `serverTime` are always present.
 *
 * `userId` is the PRIMARY participant identity on ATTEMPT_* events.
 * `studentProfileId` is optional legacy provenance (null for public
 * profile-less learners) — use it only as a display/correlation fallback.
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
  /** Primary participant identity (issue #4 P0-1/R4). */
  userId?: number | null;
  /** Legacy provenance; null for public profile-less learners. */
  studentProfileId?: number | null;
  occurredAt: string;
  serverTime: string;
  activeCount?: number | null;
}

/**
 * Resolves the stable identity key for an event's participant: `userId` when
 * present (user-based backend), else the legacy `studentProfileId`. Returns
 * null when the event carries no participant identity (session lifecycle,
 * active-count, time-sync events).
 */
export function eventIdentityKey(ev: RealtimeEventEnvelope): number | null {
  return ev.userId ?? ev.studentProfileId ?? null;
}

/** Roster entry shape needed for event-feed identity resolution. */
export interface RosterIdentity {
  userId: number;
  studentProfileId?: number | null;
  studentCode?: string | null;
  displayName: string;
}

/** Resolved display identity for an event participant. */
export interface ParticipantDisplay {
  studentCode: string | null;
  displayName: string;
}

/**
 * Builds the event-feed identity index: primary lookup by `userId`, with a
 * secondary legacy lookup by `studentProfileId` (for events emitted by an
 * older backend that only carried the profile id).
 */
export function buildParticipantIndex(
  roster: readonly RosterIdentity[]
): {
  byUser: Map<number, ParticipantDisplay>;
  byProfile: Map<number, ParticipantDisplay>;
} {
  const byUser = new Map<number, ParticipantDisplay>();
  const byProfile = new Map<number, ParticipantDisplay>();
  for (const p of roster) {
    const display: ParticipantDisplay = {
      studentCode: p.studentCode ?? null,
      displayName: p.displayName,
    };
    byUser.set(p.userId, display);
    if (p.studentProfileId != null && !byProfile.has(p.studentProfileId)) {
      byProfile.set(p.studentProfileId, display);
    }
  }
  return { byUser, byProfile };
}

/**
 * Resolves an event's participant display identity. User id first (primary);
 * legacy profile id as a compatibility fallback for older events. Returns
 * null when the event carries no participant identity.
 */
export function resolveEventParticipant(
  ev: RealtimeEventEnvelope,
  index: { byUser: Map<number, ParticipantDisplay>; byProfile: Map<number, ParticipantDisplay> }
): ParticipantDisplay | null {
  if (ev.userId != null) return index.byUser.get(ev.userId) ?? null;
  if (ev.studentProfileId != null) return index.byProfile.get(ev.studentProfileId) ?? null;
  return null;
}
