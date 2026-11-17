"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useSessionRosterQuery } from "@/hooks/queries/use-exam-sessions";
import { useSessionAttemptsQuery } from "@/hooks/queries/use-monitoring";
import { getAttemptMonitoringReport } from "@/lib/api/monitoring-report";
import { MonitoringReportView } from "./MonitoringReportView";

/**
 * P4-E per-attempt monitoring report card (design §4) on the session detail:
 * attempt picker → `GET /api/attempts/{attemptId}/monitoring/report` → the
 * shared renderer (the SAME one the printable route uses — no fork). The
 * printable-route link appears once an attempt is selected.
 */
export function MonitoringReportCard({
  sessionId,
  examId,
}: {
  sessionId: number;
  /** For the printable-route link (nested under the exam). */
  examId: number;
}) {
  const { data: roster } = useSessionRosterQuery(sessionId, true);
  const attemptsQuery = useSessionAttemptsQuery(sessionId, true);
  const [attemptId, setAttemptId] = useState<number | null>(null);

  const options = useMemo(() => {
    const nameByUser = new Map(
      (roster ?? []).map((m) => [m.userId, m] as const)
    );
    return (attemptsQuery.data?.attempts ?? []).map((attempt) => {
      const member = nameByUser.get(attempt.userId);
      const name = member?.displayName ?? `User ${attempt.userId}`;
      return {
        attemptId: attempt.attemptId,
        label: `${name} — attempt ${attempt.attemptNumber} (${attempt.status})`,
      };
    });
  }, [roster, attemptsQuery.data]);

  const reportQuery = useQuery({
    queryKey: ["attempts", attemptId, "monitoring-report"],
    queryFn: () =>
      attemptId != null
        ? getAttemptMonitoringReport(attemptId)
        : Promise.reject(new Error("No attempt selected")),
    enabled: attemptId != null,
  });

  return (
    <div
      data-testid="monitoring-report-card"
      className={cn(cardVariants(), "mt-6 p-6")}
    >
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          Monitoring report
        </h2>
        <p className="mt-1 text-xs font-medium text-[#64748B]">
          Per-attempt observations (policy, activity, camera, recording, AI,
          evidence, reviews). Observations only — never a verdict.
        </p>
      </div>

      <label
        htmlFor={`report-attempt-${sessionId}`}
        className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
      >
        Participant attempt
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id={`report-attempt-${sessionId}`}
          value={attemptId ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            setAttemptId(value === "" ? null : Number(value));
          }}
          className="h-12 w-full max-w-md rounded-lg border border-[#E2E8F0] bg-white px-4 pr-9 text-sm font-medium text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
        >
          <option value="">Select a participant…</option>
          {options.map((option) => (
            <option key={option.attemptId} value={option.attemptId}>
              {option.label}
            </option>
          ))}
        </select>
        {attemptId != null && (
          <Link
            href={`/exams/${examId}/sessions/${sessionId}/monitoring-report/${attemptId}`}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:text-[#0052FF]/80 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
          >
            Open printable report
          </Link>
        )}
      </div>

      {attemptId == null ? (
        <p className="mt-6 rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
          Select a participant to view their monitoring report.
        </p>
      ) : reportQuery.isPending ? (
        <p
          role="status"
          className="mt-6 animate-pulse text-center text-sm text-[#64748B]"
        >
          Loading report…
        </p>
      ) : reportQuery.isError ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-3 text-sm font-medium text-[#EF4444]"
        >
          Couldn&apos;t load the monitoring report.{" "}
          <button
            type="button"
            onClick={() => void reportQuery.refetch()}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : reportQuery.data ? (
        <MonitoringReportView report={reportQuery.data} className="mt-6" />
      ) : null}
    </div>
  );
}
