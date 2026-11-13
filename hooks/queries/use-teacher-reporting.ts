"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchAllSessionResults,
  getSessionResults,
  getSessionStatistics,
  type SessionResultsParams,
} from "@/lib/api/teacher-reporting";

/** Paginated session results (BEST per student). Filter-scoped key + keepPreviousData. */
export function useSessionResultsQuery(
  sessionId: number,
  params: SessionResultsParams
) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "results", params],
    queryFn: () => getSessionResults(sessionId, params),
    placeholderData: keepPreviousData,
  });
}

/**
 * ALL session-result rows (paged through server-side; capped at 20 pages ×
 * 200). Used by the Activity panel's attempt picker so every participant —
 * not just the first 200 — resolves their best attempt id.
 */
export function useAllSessionResultsQuery(sessionId: number) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "results", "all"],
    queryFn: () => fetchAllSessionResults(sessionId),
  });
}

/** Session statistics (BEST-based aggregates + distribution + per-question). */
export function useSessionStatisticsQuery(sessionId: number) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "statistics"],
    queryFn: () => getSessionStatistics(sessionId),
  });
}
