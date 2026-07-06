"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAvailableSessions, getMyAttempts } from "@/lib/api/student-attempts";

/**
 * Available sessions for the student. `staleTime` 15s — the status flags
 * (canStartNow/canResume) are time-sensitive, but we don't want to refetch
 * on every focus. Real-time sync is a later concern (FE13 WebSocket).
 */
export function useAvailableSessionsQuery() {
  return useQuery({
    queryKey: ["student", "available-sessions"],
    queryFn: getAvailableSessions,
    staleTime: 15_000,
  });
}

/** Own-attempt history (paginated). `keepPreviousData` avoids flicker on page change. */
export function useMyAttemptsQuery(page: number, size: number) {
  return useQuery({
    queryKey: ["student", "my-attempts", { page, size }],
    queryFn: () => getMyAttempts(page, size),
    placeholderData: keepPreviousData,
  });
}
