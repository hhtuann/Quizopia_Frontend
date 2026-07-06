"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelSession,
  closeSession,
  getSessionDetail,
  listMySessions,
  openSession,
  scheduleSession,
  updateSession,
  type ExamSessionListParams,
  type SessionLifecycleAction,
  type UpdateExamSessionRequest,
} from "@/lib/api/exam-sessions";

/**
 * Sessions list query — filter-scoped key + `keepPreviousData` (no flicker on
 * page/search/filter change). Mirrors `useExamsQuery`.
 */
export function useExamSessionsQuery(params: ExamSessionListParams) {
  return useQuery({
    queryKey: ["exam-sessions", params],
    queryFn: () => listMySessions(params),
    placeholderData: keepPreviousData,
  });
}

/** Teacher detail for one session. `enabled` guards against an invalid id. */
export function useExamSessionDetailQuery(sessionId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "detail"],
    queryFn: () => getSessionDetail(sessionId),
    enabled,
  });
}

/**
 * PUT config update. On success invalidates the detail + list. `expectedVersion`
 * is the optimistic token; a 409 EXAM_CONCURRENT_MODIFICATION rejects (caller
 * refetches + notifies — no auto-overwrite).
 */
export function useUpdateSessionMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateExamSessionRequest) => updateSession(sessionId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
    },
  });
}

/**
 * Lifecycle action (schedule/open/close/cancel). On success invalidates detail
 * + list so the new status + buttons render. Idempotent at the target state.
 * Errors reject → caller maps the code + decides whether to refetch.
 */
export function useSessionActionMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: SessionLifecycleAction) => {
      switch (action) {
        case "schedule":
          return scheduleSession(sessionId);
        case "open":
          return openSession(sessionId);
        case "close":
          return closeSession(sessionId);
        case "cancel":
          return cancelSession(sessionId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
    },
  });
}
