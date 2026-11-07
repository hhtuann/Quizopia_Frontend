"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  blockParticipant,
  listParticipants,
  unblockParticipant,
  type ParticipantListParams,
} from "@/lib/api/exam-session-participants";

/**
 * Participants list for a session. Filter-scoped key + `keepPreviousData`.
 */
export function useParticipantsQuery(
  sessionId: number,
  params: ParticipantListParams
) {
  return useQuery({
    queryKey: ["exam-sessions", sessionId, "participants", params],
    queryFn: () => listParticipants(sessionId, params),
    enabled: Number.isFinite(sessionId),
    placeholderData: keepPreviousData,
  });
}

/** Block a participant (idempotent 200). */
export function useBlockMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantId: number) => blockParticipant(sessionId, participantId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "participants"],
      }),
  });
}

/** Unblock a participant (idempotent 200). */
export function useUnblockMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantId: number) => unblockParticipant(sessionId, participantId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "participants"],
      }),
  });
}
