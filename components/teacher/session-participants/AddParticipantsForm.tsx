"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAddParticipantsMutation } from "@/hooks/queries/use-exam-session-participants";
import type { AddParticipantsResponse } from "@/lib/api/exam-session-participants";
import type { NormalizedApiError } from "@/lib/api";

const textareaClass =
  "w-full min-h-[88px] rounded-button bg-[#E0E5EC] px-4 py-3 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300 resize-y";
const primaryBtn =
  "neumorphic-active-press inline-flex h-11 items-center justify-center rounded-button bg-[#6C63FF] px-5 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";

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
    <form noValidate onSubmit={onSubmit} className="rounded-container bg-[#E0E5EC] p-5 shadow-extruded">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Add participants</h3>
      <label htmlFor="add-ids" className="mb-2 block pl-1 text-xs font-semibold text-[#6B7280]">
        Student profile IDs
      </label>
      <textarea
        id="add-ids"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"201, 202, 203\n(one per line or comma/space separated)"}
        className={textareaClass}
      />
      <p className="mt-1.5 pl-1 text-xs text-[#6B7280]">
        No student search yet — enter profile IDs. Invalid or cross-school IDs are reported, not added.
      </p>
      <button type="submit" disabled={addMut.isPending} className={`mt-3 ${primaryBtn}`}>
        {addMut.isPending ? "Adding…" : "Add participants"}
      </button>

      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-[#E0E5EC] p-3 text-xs font-medium text-[#3D4852] shadow-inset-deep">
          {error}
        </p>
      )}

      {result && (
        <div role="status" className="mt-3 space-y-1.5 rounded-2xl bg-[#E0E5EC] p-3 text-xs shadow-inset-small">
          <p className="font-semibold text-[#38B2AC]">Added {result.added} participant{result.added === 1 ? "" : "s"}.</p>
          {result.duplicated.length > 0 && (
            <p className="text-[#6B7280]">Already added: {result.duplicated.join(", ")}</p>
          )}
          {result.invalid.length > 0 && (
            <p className="text-[#6B7280]">Not found / not in your school: {result.invalid.join(", ")}</p>
          )}
        </div>
      )}
    </form>
  );
}
