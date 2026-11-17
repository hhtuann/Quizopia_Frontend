"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  getAnswerHistory,
  getAttemptTimeline,
  getSessionAttempts,
  type AttemptTimelineParams,
} from "@/lib/api/monitoring";
import {
  timelineGroupTypes,
  type TimelineGroupValue,
} from "@/lib/monitoring/timeline";

/** Client-side timeline filters (source toggle + type-group select). */
export interface TimelineFilters {
  source: "ALL" | "CLIENT" | "SERVER";
  group: TimelineGroupValue;
  /**
   * P4-E: reviews-only toggle — sends `types=ALERT_REVIEW_RECORDED`
   * (overrides the type-group while active).
   */
  reviewsOnly: boolean;
  /**
   * F08: server-side time-range window (inclusive), `datetime-local`
   * strings converted to ISO; empty = unbounded. Part of the query key so
   * a range change restarts pagination from the first page.
   */
  from: string;
  to: string;
}

export const DEFAULT_TIMELINE_FILTERS: TimelineFilters = {
  source: "ALL",
  group: "ALL",
  reviewsOnly: false,
  from: "",
  to: "",
};

/** Filters → REST params (undefined values are omitted by the param builder). */
export function timelineQueryParams(
  filters: TimelineFilters
): AttemptTimelineParams {
  const types = filters.reviewsOnly
    ? ["ALERT_REVIEW_RECORDED"]
    : timelineGroupTypes(filters.group);
  return {
    source: filters.source === "ALL" ? undefined : filters.source,
    types: types.length > 0 ? types : undefined,
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    to: filters.to ? new Date(filters.to).toISOString() : undefined,
  };
}

/**
 * Cursor-paged attempt timeline (infinite query — "Load more" via nextCursor).
 * `placeholderData: keepPreviousData` keeps the loaded list on screen while a
 * filter change or a live refetch (ATTEMPT_ACTIVITY) is in flight.
 */
export function useAttemptTimelineQuery(
  attemptId: number,
  filters: TimelineFilters = DEFAULT_TIMELINE_FILTERS,
  enabled = true
) {
  return useInfiniteQuery({
    queryKey: ["attempts", attemptId, "timeline", filters],
    queryFn: ({ pageParam }) =>
      getAttemptTimeline(attemptId, {
        ...timelineQueryParams(filters),
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Accepted answer versions (owner or session-owner teacher). */
export function useAnswerHistoryQuery(
  attemptId: number,
  attemptQuestionId?: number,
  enabled = true
) {
  return useQuery({
    queryKey: ["attempts", attemptId, "answer-history", attemptQuestionId ?? null],
    queryFn: () => getAnswerHistory(attemptId, attemptQuestionId),
    enabled,
  });
}

/** All attempts of a session incl. IN_PROGRESS — teacher Activity picker. */
export function useSessionAttemptsQuery(sessionId: number, enabled = true) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "attempts"],
    queryFn: () => getSessionAttempts(sessionId),
    enabled,
  });
}
