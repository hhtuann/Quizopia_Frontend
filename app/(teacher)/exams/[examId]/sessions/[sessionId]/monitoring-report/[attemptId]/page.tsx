"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { getAttemptMonitoringReport } from "@/lib/api/monitoring-report";
import { MonitoringReportView } from "@/components/teacher/monitoring/MonitoringReportView";

/**
 * P4-E printable monitoring report (design §4): same renderer as the session
 * detail card, on a chrome-less page. `@media print` (globals.css) hides the
 * app shell; this page hides its own controls via `print:hidden` and the
 * report sections keep themselves unbroken (`break-inside-avoid`).
 */
export default function MonitoringReportPrintPage() {
  const { examId, sessionId, attemptId } = useParams<{
    examId: string;
    sessionId: string;
    attemptId: string;
  }>();
  const examIdNum = Number(examId);
  const sessionIdNum = Number(sessionId);
  const attemptIdNum = Number(attemptId);
  const valid =
    Number.isFinite(examIdNum) &&
    Number.isFinite(sessionIdNum) &&
    Number.isFinite(attemptIdNum);
  const backHref = `/exams/${examIdNum}/sessions/${sessionIdNum}`;

  const reportQuery = useQuery({
    queryKey: ["attempts", valid ? attemptIdNum : null, "monitoring-report"],
    queryFn: () => getAttemptMonitoringReport(attemptIdNum),
    enabled: valid,
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="sr-only">Monitoring report (printable)</h1>

      {/* Controls never print. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Back to session
        </Link>
        <Button type="button" onClick={() => window.print()}>
          Print report
        </Button>
      </div>

      {!valid ? (
        <p role="alert" className="text-sm font-medium text-[#EF4444]">
          Invalid report link.{" "}
          <Link
            href={backHref}
            className="font-semibold underline underline-offset-2"
          >
            Go back to the session
          </Link>
        </p>
      ) : reportQuery.isPending ? (
        <p
          role="status"
          className="animate-pulse py-6 text-center text-sm text-[#64748B]"
        >
          Loading report…
        </p>
      ) : reportQuery.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-3 text-sm font-medium text-[#EF4444]"
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
        <MonitoringReportView report={reportQuery.data} />
      ) : null}
    </div>
  );
}
