"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAttemptDetail,
  startAttempt,
  submitAttempt,
  type StartAttemptRequest,
} from "@/lib/api/student-attempt";

/**
 * Start (or resume) an attempt. On success the caller redirects to
 * `/attempts/{attemptId}`. The available-sessions list refetches naturally
 * when the student returns to `/sessions` (react-query refetchOnMount).
 */
export function useStartAttemptMutation() {
  return useMutation({
    mutationFn: ({
      sessionId,
      req,
    }: {
      sessionId: number;
      req?: StartAttemptRequest;
    }) => startAttempt(sessionId, req),
  });
}

/** Attempt detail (questions + saved answers). `enabled` guards an invalid id. */
export function useAttemptDetailQuery(attemptId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["student", "attempts", attemptId],
    queryFn: () => getAttemptDetail(attemptId),
    enabled,
  });
}

/**
 * Submit attempt (idempotent). On success invalidates all student queries
 * (attempt detail, my-attempts, available-sessions). The CALLER manages the
 * idempotency key lifecycle — this mutation takes `{ key }` and passes it
 * verbatim. On network retry, the caller passes the SAME key.
 */
export function useSubmitAttemptMutation(attemptId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key }: { key: string }) =>
      submitAttempt(attemptId, { submissionIdempotencyKey: key }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student"] });
    },
  });
}
