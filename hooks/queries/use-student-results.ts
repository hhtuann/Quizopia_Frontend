"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAttemptResult,
  getMyBestResult,
} from "@/lib/api/student-results";

/** Own attempt result (grading summary + per-question outcomes). */
export function useAttemptResultQuery(attemptId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["student", "attempts", attemptId, "result"],
    queryFn: () => getAttemptResult(attemptId),
    enabled,
  });
}

/** Own BEST result for a session (null if no submitted+graded attempts). */
export function useMyBestResultQuery(sessionId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["student", "sessions", sessionId, "best"],
    queryFn: () => getMyBestResult(sessionId),
    enabled,
  });
}
