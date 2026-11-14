"use client";

import { useMemo } from "react";
import { useSessionRosterQuery } from "@/hooks/queries/use-exam-sessions";
import { useSessionAttemptsQuery } from "@/hooks/queries/use-monitoring";
import { AttemptTimeline } from "./AttemptTimeline";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Teacher "Activity" panel for the session detail page (P4-A4): pick a
 * participant's attempt from the roster, then read its durable timeline.
 *
 * The roster provides display identity; attempt ids come from the
 * session-attempts listing (ALL statuses — including IN_PROGRESS, which the
 * graded best-results report misses). Members without attempts render as
 * disabled options. Live updates arrive as
 * ATTEMPT_ACTIVITY envelopes on the session topic (wired by the parent via
 * LiveMonitor's `onAttemptActivity`) → timeline query invalidation → REST
 * refetch (source of truth).
 */
export function TeacherActivityPanel({
  sessionId,
  selectedAttemptId,
  onSelectAttempt,
}: {
  sessionId: number;
  selectedAttemptId: number | null;
  onSelectAttempt: (attemptId: number | null) => void;
}) {
  const { data: roster } = useSessionRosterQuery(sessionId, true);
  const attemptsQuery = useSessionAttemptsQuery(sessionId, true);

  const options = useMemo(() => {
    const nameByUser = new Map(
      (roster ?? []).map((m) => [m.userId, m] as const)
    );
    return (attemptsQuery.data?.attempts ?? []).map((attempt) => {
      const member = nameByUser.get(attempt.userId);
      const name = member?.displayName ?? `User ${attempt.userId}`;
      const suffix =
        attempt.status === "IN_PROGRESS" ? "live" : attempt.status.toLowerCase();
      return {
        attemptId: attempt.attemptId as number | null,
        label: `${name} — attempt ${attempt.attemptNumber} (${suffix})`,
      };
    });
  }, [roster, attemptsQuery.data]);

  const hasOptions = options.length > 0;

  return (
    <div className={cn(cardVariants(), "mt-6 p-6")}>
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          Activity
        </h2>
        <p className="mt-1 text-xs font-medium text-[#64748B]">
          Per-participant activity timeline (client observations + server-confirmed
          events). Updates live while the session runs.
        </p>
      </div>

      <label
        htmlFor={`activity-attempt-${sessionId}`}
        className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
      >
        Participant attempt
      </label>
      <select
        id={`activity-attempt-${sessionId}`}
        value={selectedAttemptId ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          onSelectAttempt(value === "" ? null : Number(value));
        }}
        className="h-12 w-full max-w-md rounded-lg border border-[#E2E8F0] bg-white px-4 pr-9 text-sm font-medium text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
      >
        <option value="">Select a participant…</option>
        {options.map((option) => (
          <option
            key={option.attemptId}
            value={option.attemptId ?? ""}
            disabled={option.attemptId == null}
          >
            {option.label}
          </option>
        ))}
      </select>
      {!hasOptions && (
        <p className="mt-2 text-xs text-[#64748B]">
          No participants yet — the roster fills as students join the session.
        </p>
      )}

      {selectedAttemptId != null ? (
        <AttemptTimeline
          attemptId={selectedAttemptId}
          className="mt-6 border-0 p-0 shadow-none"
          emptyHint="No activity recorded for this attempt yet."
        />
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
          Select a participant to inspect their activity timeline.
        </p>
      )}
    </div>
  );
}
