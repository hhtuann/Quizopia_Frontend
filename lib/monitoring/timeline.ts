import type { AttemptTimelineItem } from "@/lib/api/monitoring";

/**
 * Pure timeline presentation helpers (Phase 4-A) — item labels, groups,
 * clock-skew detection and ANSWER_ACCEPTED summaries. Kept free of React so
 * they are unit-testable; `AttemptTimeline.tsx` renders from these.
 */

/** Friendly labels for every P4-A event type (CLIENT + SERVER). */
export const TIMELINE_TYPE_LABEL: Record<string, string> = {
  // CLIENT
  ANSWER_SELECTED: "Answer selected",
  ANSWER_CHANGED: "Answer changed",
  ANSWER_CLEARED: "Answer cleared",
  QUESTION_NAVIGATED: "Question navigated",
  QUESTION_FLAGGED: "Question flagged",
  QUESTION_UNFLAGGED: "Question unflagged",
  AUTOSAVE_FAILED: "Autosave failed",
  TAB_HIDDEN: "Tab hidden",
  TAB_VISIBLE: "Tab visible",
  WINDOW_FOCUS_LOST: "Focus lost",
  WINDOW_FOCUS_GAINED: "Focus gained",
  PAGE_RELOADED: "Page reloaded",
  CONNECTION_LOST: "Connection lost",
  CONNECTION_RESTORED: "Connection restored",
  // SERVER
  ATTEMPT_STARTED: "Attempt started",
  ATTEMPT_RESUMED: "Attempt resumed",
  ATTEMPT_SUBMITTED: "Attempt submitted",
  ATTEMPT_TIMED_OUT: "Attempt timed out",
  ANSWER_ACCEPTED: "Answer accepted",
  // SERVER (P4-B camera — webhook/reconcile driven, server-only)
  CAMERA_CONNECTED: "Camera connected",
  CAMERA_DISCONNECTED: "Camera disconnected",
  CAMERA_RECONNECTED: "Camera reconnected",
  CAMERA_REVOKED: "Camera access revoked",
  MONITORING_GAP: "Monitoring gap",
}

export type TimelineGroupValue =
  | "ALL"
  | "ANSWERS"
  | "NAVIGATION"
  | "ATTENTION"
  | "CONNECTION"
  | "LIFECYCLE";

export interface TimelineGroup {
  readonly value: TimelineGroupValue;
  readonly label: string;
  readonly types: readonly string[];
}

/** Type-group filter values (the "type group select" in the timeline UI). */
export const TIMELINE_GROUPS: readonly TimelineGroup[] = [
  { value: "ALL", label: "All events", types: [] },
  {
    value: "ANSWERS",
    label: "Answers",
    types: [
      "ANSWER_SELECTED",
      "ANSWER_CHANGED",
      "ANSWER_CLEARED",
      "ANSWER_ACCEPTED",
    ],
  },
  {
    value: "NAVIGATION",
    label: "Navigation & flags",
    types: [
      "QUESTION_NAVIGATED",
      "QUESTION_FLAGGED",
      "QUESTION_UNFLAGGED",
    ],
  },
  {
    value: "ATTENTION",
    label: "Tabs & focus",
    types: [
      "TAB_HIDDEN",
      "TAB_VISIBLE",
      "WINDOW_FOCUS_LOST",
      "WINDOW_FOCUS_GAINED",
      "PAGE_RELOADED",
    ],
  },
  {
    value: "CONNECTION",
    label: "Connection & saving",
    types: [
      "CONNECTION_LOST",
      "CONNECTION_RESTORED",
      "AUTOSAVE_FAILED",
      "CAMERA_CONNECTED",
      "CAMERA_DISCONNECTED",
      "CAMERA_RECONNECTED",
      "CAMERA_REVOKED",
      "MONITORING_GAP",
    ],
  },
  {
    value: "LIFECYCLE",
    label: "Lifecycle",
    types: [
      "ATTEMPT_STARTED",
      "ATTEMPT_RESUMED",
      "ATTEMPT_SUBMITTED",
      "ATTEMPT_TIMED_OUT",
    ],
  },
];

/** Resolve the type list a group filter sends as the `types` query param. */
export function timelineGroupTypes(group: TimelineGroupValue): string[] {
  const types = TIMELINE_GROUPS.find((g) => g.value === group)?.types;
  return types ? [...types] : [];
}

/** Which group an event type belongs to ("ALL" never matches a concrete item). */
export function timelineGroupOf(eventType: string): TimelineGroupValue {
  for (const g of TIMELINE_GROUPS) {
    if (g.value !== "ALL" && (g.types as readonly string[]).includes(eventType)) {
      return g.value;
    }
  }
  return "ALL";
}

/** Clock-skew threshold: |clientOccurredAt − serverReceivedAt| > 2 minutes. */
export const CLOCK_SKEW_THRESHOLD_MS = 2 * 60 * 1000;

/** Signed skew (client − server) in ms, or null when there is no client time. */
export function clockSkewMs(item: AttemptTimelineItem): number | null {
  if (!item.clientOccurredAt) return null;
  const client = new Date(item.clientOccurredAt).getTime();
  const server = new Date(item.serverReceivedAt).getTime();
  if (Number.isNaN(client) || Number.isNaN(server)) return null;
  return client - server;
}

export function hasClockSkew(item: AttemptTimelineItem): boolean {
  const skew = clockSkewMs(item);
  return skew != null && Math.abs(skew) > CLOCK_SKEW_THRESHOLD_MS;
}

/** Source badge text: SERVER events are server-confirmed; CLIENT are observations. */
export function timelineSourceLabel(source: "CLIENT" | "SERVER"): string {
  return source === "SERVER" ? "Server-confirmed" : "Client observation";
}

export function timelineTypeLabel(eventType: string): string {
  return TIMELINE_TYPE_LABEL[eventType] ?? eventType;
}

/**
 * ANSWER_ACCEPTED summary from METADATA ONLY ({attemptQuestionId,
 * acceptedSequence}): "Answer Q3 → v2 accepted". `questionLabels` optionally
 * maps attemptQuestionId → a friendlier label (e.g. display-order "Q3");
 * without it the raw attemptQuestionId is used. Returns null for other types
 * or malformed metadata.
 */
export function answerAcceptedSummary(
  item: AttemptTimelineItem,
  questionLabels?: Record<number, string>
): string | null {
  if (item.eventType !== "ANSWER_ACCEPTED") return null;
  const qid = item.metadata?.attemptQuestionId;
  const seq = item.metadata?.acceptedSequence;
  if (typeof qid !== "number" || typeof seq !== "number") return null;
  // Without a label map (teacher panel) the raw DB id is shown neutrally —
  // never as "Q4821", which would read as a position in the paper.
  const label = questionLabels?.[qid] ?? `question #${qid}`;
  return `Answer ${label} → v${seq} accepted`;
}

/** One question's accepted versions, ordered by accepted sequence. */
export interface QuestionVersions {
  attemptQuestionId: number;
  label: string;
  versions: { sequence: number; acceptedAt: string }[];
}

/**
 * Group answer-history items per question for the "Accepted answer versions"
 * card. Groups sort NUMERICALLY by the label's question index (Q2 before
 * Q10); missing labels fall back to the raw id order.
 */
export function groupAnswerVersions(
  items: readonly {
    attemptQuestionId: number;
    acceptedSequence: number;
    acceptedAt: string;
  }[],
  questionLabels?: Record<number, string>
): QuestionVersions[] {
  const byQuestion = new Map<number, { sequence: number; acceptedAt: string }[]>();
  for (const item of items) {
    const list = byQuestion.get(item.attemptQuestionId) ?? [];
    list.push({ sequence: item.acceptedSequence, acceptedAt: item.acceptedAt });
    byQuestion.set(item.attemptQuestionId, list);
  }
  const groups: QuestionVersions[] = [...byQuestion.entries()].map(
    ([attemptQuestionId, versions]) => {
      versions.sort((a, b) => a.sequence - b.sequence);
      return {
        attemptQuestionId,
        label: questionLabels?.[attemptQuestionId] ?? `question #${attemptQuestionId}`,
        versions,
      };
    }
  );
  const indexFor = (qid: number) => {
    const label = questionLabels?.[qid];
    const parsed = label ? Number(label.replace(/\D+/g, "")) : NaN;
    return Number.isFinite(parsed) ? parsed : qid;
  };
  return groups.sort((a, b) => indexFor(a.attemptQuestionId) - indexFor(b.attemptQuestionId));
}

/** Everything the timeline row renders, derived in one call. */
export function describeTimelineItem(
  item: AttemptTimelineItem,
  questionLabels?: Record<number, string>
): {
  label: string;
  sourceLabel: string;
  skewMs: number | null;
  skewed: boolean;
  summary: string | null;
} {
  return {
    label: timelineTypeLabel(item.eventType),
    sourceLabel: timelineSourceLabel(item.source),
    skewMs: clockSkewMs(item),
    skewed: hasClockSkew(item),
    summary: answerAcceptedSummary(item, questionLabels),
  };
}
