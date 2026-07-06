"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addParticipants,
  blockParticipant,
  listParticipants,
  unblockParticipant,
  type AddParticipantsRequest,
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

/**
 * Bulk add. **Always** invalidates on success — `addParticipants` returns 200
 * even on full partial-failure (`added=0`), and the participant list + the
 * session detail (`participantCount`) must refresh regardless.
 */
export function useAddParticipantsMutation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: AddParticipantsRequest) => addParticipants(sessionId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "participants"],
      });
      queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "detail"],
      });
    },
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
