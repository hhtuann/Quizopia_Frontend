"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAddParticipantsMutation } from "@/hooks/queries/use-exam-session-participants";
import { Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { AddParticipantsResponse } from "@/lib/api/exam-session-participants";
import type { NormalizedApiError } from "@/lib/api";

const textareaClass =
  "w-full min-h-[88px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

/** Parse free-form ID text (comma/space/newline separated) → deduped positive integers. */
function parseIds(text: string): number[] {
  const seen = new Set<number>();
  for (const raw of text.split(/[\s,]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const n = Number(t);
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}

function describeAddError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_SESSION_INVALID_STATE":
        return "Participants can only be added while the session is DRAFT or SCHEDULED.";
      case "EXAM_PARTICIPANT_DUPLICATE":
        return "A duplicate was detected mid-add. Refresh and retry.";
      case "EXAM_SESSION_ACCESS_DENIED":
        return "You don't have permission to add participants.";
      case "EXAM_VALIDATION_ERROR":
        return "Enter at least one valid student profile ID.";
      case "EXAM_SESSION_NOT_FOUND":
        return "This session could not be found.";
      default:
        return norm.message || "Could not add participants.";
    }
  }
  if (norm?.kind === "network") return "Network error — check your connection.";
  return "Something went wrong. Please try again.";
}

/**
 * Bulk-add participants by raw `studentProfileId`. There is NO student-search
 * endpoint (known UX gap accepted by the Day-6 contract) — teachers enter IDs
 * manually. The response is HTTP 200 partial-success `{added, duplicated[], invalid[]}`,
 * rendered as three distinct groups (NOT an ApiError, even when `added === 0`).
 */
export function AddParticipantsForm({ sessionId }: { sessionId: number }) {
  const addMut = useAddParticipantsMutation(sessionId);
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [result, setResult] = useState<AddParticipantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ids = parseIds(text);
    if (ids.length === 0) {
      setError("Enter at least one student profile ID (comma, space, or newline separated).");
      setResult(null);
      return;
    }
    setError(null);
    setResult(null);
    try {
      const res = await addMut.mutateAsync({ studentProfileIds: ids });
      setResult(res);
      setText("");
    } catch (err) {
      setError(describeAddError(err));
      const norm = err as NormalizedApiError | undefined;
      // State may have changed (e.g. session opened) → refresh detail so the form unmounts.
      if (norm?.kind === "api" && norm.code === "EXAM_SESSION_INVALID_STATE") {
        queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "detail"] });
      }
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className={cn(cardVariants(), "p-5")}>
      <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Add participants</h3>
      <label htmlFor="add-ids" className="mb-2 block pl-1 text-xs font-semibold text-[#64748B]">
        Student profile IDs
      </label>
      <textarea
        id="add-ids"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"201, 202, 203\n(one per line or comma/space separated)"}
        className={textareaClass}
      />
      <p className="mt-1.5 pl-1 text-xs text-[#64748B]">
        No student search yet — enter profile IDs. Invalid or cross-school IDs are reported, not added.
      </p>
      <Button type="submit" disabled={addMut.isPending} className="mt-3">
        {addMut.isPending ? "Adding…" : "Add participants"}
      </Button>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-xs font-medium text-[#EF4444]">
          {error}
        </p>
      )}

      {result && (
        <div role="status" className="mt-3 space-y-1.5 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-3 text-xs">
          <p className="font-semibold text-[#10B981]">Added {result.added} participant{result.added === 1 ? "" : "s"}.</p>
          {result.duplicated.length > 0 && (
            <p className="text-[#64748B]">Already added: {result.duplicated.join(", ")}</p>
          )}
          {result.invalid.length > 0 && (
            <p className="text-[#64748B]">Not found / not in your school: {result.invalid.join(", ")}</p>
          )}
        </div>
      )}
    </form>
  );
}
