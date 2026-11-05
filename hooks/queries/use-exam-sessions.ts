"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignSessionClasses,
  cancelSession,
  closeSession,
  createExamSession,
  getSessionClasses,
  getSessionDetail,
  getSessionRoster,
  listExamSessions,
  listMySessions,
  openSession,
  scheduleSession,
  updateSession,
  type CreateExamSessionRequest,
  type ExamSessionListParams,
  type SessionLifecycleAction,
  type UpdateExamSessionRequest,
} from "@/lib/api/exam-sessions";

/**
 * Sessions of ONE exam (canonical nested route, Phase 1 Task B).
 * Key lives under ["exams", examId, ...] so exam-scoped invalidations and the
 * flat ["exam-sessions"] tree stay separate.
 */
export function useExamSessionsQuery(
  examId: number,
  params: ExamSessionListParams = {},
  enabled = true
) {
  return useQuery({
    queryKey: ["exams", examId, "sessions", params],
    queryFn: () => listExamSessions(examId, params),
    placeholderData: keepPreviousData,
    enabled: enabled && Number.isFinite(examId) && examId > 0,
  });
}

/** Legacy flat list (GET /api/exam-sessions/my) — deprecated, kept for transition. */
export function useMyExamSessionsQuery(params: ExamSessionListParams) {
  return useQuery({
    queryKey: ["exam-sessions", "my", params],
    queryFn: () => listMySessions(params),
    placeholderData: keepPreviousData,
  });
}

/** Teacher detail for one session (flat route, by sessionId). `enabled` guards against an invalid id. */
export function useExamSessionDetailQuery(sessionId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "detail"],
    queryFn: () => getSessionDetail(sessionId),
    enabled,
  });
}

/**
 * Session roster (class members ∪ direct participants). Used to resolve
 * `studentProfileId` → `{studentCode, displayName}` in the live monitor.
 */
export function useSessionRosterQuery(sessionId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "roster"],
    queryFn: () => getSessionRoster(sessionId),
    enabled,
  });
}

/**
 * Create a session under an exam (canonical nested route). On success
 * invalidates the exam's sessions list, the flat ["exam-sessions"] tree and
 * the exams list (participant/session counts may appear).
 */
export function useCreateExamSessionMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: Omit<CreateExamSessionRequest, "examId">) =>
      createExamSession(examId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
    },
  });
}

/**
 * PUT config update. On success invalidates the detail + both session trees.
 * `expectedVersion` is the optimistic token; a 409 EXAM_CONCURRENT_MODIFICATION
 * rejects (caller refetches + notifies — no auto-overwrite).
 */
export function useUpdateSessionMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateExamSessionRequest) => updateSession(sessionId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}

/**
 * Lifecycle action (schedule/open/close/cancel). On success invalidates the
 * detail + BOTH trees (flat ["exam-sessions"] and every exam's nested
 * ["exams", *, "sessions"] list via the root ["exams"] key). Idempotent at
 * the target state; errors reject → caller maps the code.
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
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}

/** Assigned classes for a session (visibility = CLASS_RESTRICTED). */
export function useSessionClassesQuery(sessionId: number) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "classes"],
    queryFn: () => getSessionClasses(sessionId),
    enabled: !!sessionId,
  });
}

/** REPLACE the assigned classes (PUT .../classes). Invalidates classes + detail/trees. */
export function useAssignClassesMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classroomIds: number[]) => assignSessionClasses(sessionId, classroomIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "classes"] });
      queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}
