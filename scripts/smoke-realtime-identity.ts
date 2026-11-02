/**
 * P0-R4 smoke test (issue #4): realtime identity correlation must be
 * user-based — a PUBLIC profile-less participant's ATTEMPT_* event
 * (userId set, studentProfileId absent) must resolve to a visible roster
 * identity, and the legacy profile-only path must keep working.
 *
 * Run: node --experimental-strip-types scripts/smoke-realtime-identity.ts
 * (Node >= 22.6; zero test-framework dependencies).
 *
 * Imports the REAL production helpers from lib/realtime/types.ts — no
 * re-implementation.
 */
/* eslint-disable */
// Smoke script only — executed via `node --experimental-strip-types`, outside
// tsconfig's program (hence the .ts import extensions, which the Next build
// would otherwise reject).
// @ts-nocheck
import type { RealtimeEventEnvelope } from "../lib/realtime/types.ts";
import {
  buildParticipantIndex,
  resolveEventParticipant,
  eventIdentityKey,
  type ParticipantDisplay,
} from "../lib/realtime/types.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`,
  );
}

function display(p: ParticipantDisplay | null): string | null {
  if (p == null) return null;
  return p.studentCode != null ? `${p.studentCode} · ${p.displayName}` : p.displayName;
}

const roster = [
  { userId: 101, studentProfileId: 51, studentCode: "STU00000001", displayName: "Nguyen Van A" },
  { userId: 202, studentProfileId: null, studentCode: null, displayName: "Public Learner" }, // P0-R4 case
];
const index = buildParticipantIndex(roster);

// 1. Public profile-less learner event: userId set, studentProfileId absent —
//    previously SKIPPED by the profileId-keyed LiveMonitor.
const publicEvent: RealtimeEventEnvelope = {
  eventId: "e1",
  eventType: "ATTEMPT_STARTED",
  sessionId: 9,
  attemptId: 90,
  userId: 202,
  occurredAt: "2026-11-02T10:00:00Z",
  serverTime: "2026-11-02T10:00:00Z",
};
check("public event identity key = userId", eventIdentityKey(publicEvent), 202);
check("public event resolves displayName (not skipped)", display(resolveEventParticipant(publicEvent, index)), "Public Learner");

// 2. School learner event: both ids present — userId wins (primary).
const schoolEvent: RealtimeEventEnvelope = {
  eventId: "e2",
  eventType: "ATTEMPT_SUBMITTED",
  sessionId: 9,
  attemptId: 91,
  userId: 101,
  studentProfileId: 51,
  occurredAt: "2026-11-02T10:01:00Z",
  serverTime: "2026-11-02T10:01:00Z",
};
check("school event identity key = userId (primary over profileId)", eventIdentityKey(schoolEvent), 101);
check(
  "school event renders code + name",
  display(resolveEventParticipant(schoolEvent, index)),
  "STU00000001 · Nguyen Van A",
);

// 3. Legacy backend event (profileId only, no userId) — compatibility fallback.
const legacyEvent = { ...schoolEvent, eventId: "e3", userId: undefined } as RealtimeEventEnvelope;
check("legacy event falls back to studentProfileId", eventIdentityKey(legacyEvent), 51);
check(
  "legacy fallback resolves via the profile index",
  display(resolveEventParticipant(legacyEvent, index)),
  "STU00000001 · Nguyen Van A",
);

// 4. Session/control events carry no participant identity → no label.
const controlEvent: RealtimeEventEnvelope = {
  eventId: "e4",
  eventType: "ACTIVE_COUNT_CHANGED",
  sessionId: 9,
  occurredAt: "2026-11-02T10:02:00Z",
  serverTime: "2026-11-02T10:02:00Z",
  activeCount: 2,
};
check("control event has no identity", eventIdentityKey(controlEvent), null);
check("control event resolves no participant", resolveEventParticipant(controlEvent, index), null);

// 5. Unknown identity (not on roster) resolves to null (feed omits the label
//    instead of leaking or crashing).
check("unknown userId resolves null", resolveEventParticipant(
  { ...publicEvent, eventId: "e5", userId: 999 }, index), null);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
