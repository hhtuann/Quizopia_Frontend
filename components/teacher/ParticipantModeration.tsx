"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/api/http-client";
import type { SessionRosterItem } from "@/lib/api/exam-sessions";
import type { ExamSessionParticipantResponse } from "@/lib/api/exam-session-participants";
import { Button } from "@/components/ui";

/** Both operations are explicit and idempotent; unknown state is never shown as ELIGIBLE. */
export function ParticipantModeration({ sessionId, roster, editable }: {
  sessionId: number;
  roster: SessionRosterItem[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ userId, action }: { userId: number; action: "block" | "unblock" }) =>
      http.post<ExamSessionParticipantResponse>(
        `/api/exam-sessions/${sessionId}/participants/by-user/${userId}/${action}`
      ),
    onSuccess: (participant) => {
      setMessage(`User ${participant.userId}: ${participant.status}. Existing attempts may still be completed.`);
      void queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "participants"] });
      void queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "roster"] });
    },
    onError: () => setMessage("Moderation failed. Refresh and check your permissions and the session state."),
  });

  return (
    <section className="mt-6 border-t border-[#E2E8F0] pt-4" aria-label="Participant moderation">
      <h3 className="font-semibold text-[#0F172A]">Participant moderation</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Block prevents discovery and future starts. It preserves existing attempts and grades.
        Only known attempt users or assigned participants can be moderated.
      </p>
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
      {roster.length === 0 && <p className="mt-3 text-sm text-[#64748B]">No known participants yet.</p>}
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {roster.map((participant) => (
          <li key={participant.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E2E8F0] p-3">
            <span className="mr-auto text-sm">{participant.displayName} · User {participant.userId}</span>
            <Button type="button" variant="outline" disabled={!editable || mutation.isPending}
              aria-label={`Block ${participant.displayName}`}
              onClick={() => mutation.mutate({ userId: participant.userId, action: "block" })}>Block</Button>
            <Button type="button" variant="outline" disabled={!editable || mutation.isPending}
              aria-label={`Unblock ${participant.displayName}`}
              onClick={() => mutation.mutate({ userId: participant.userId, action: "unblock" })}>Unblock</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
