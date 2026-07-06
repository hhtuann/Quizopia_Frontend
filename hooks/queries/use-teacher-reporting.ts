"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
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

/** Session statistics (BEST-based aggregates + distribution + per-question). */
export function useSessionStatisticsQuery(sessionId: number) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "statistics"],
    queryFn: () => getSessionStatistics(sessionId),
  });
}
