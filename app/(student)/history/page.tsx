"use client";

import { useState } from "react";
import Link from "next/link";
import { useMyAttemptsQuery } from "@/hooks/queries/use-student-attempts";
import type { AttemptStatus } from "@/lib/api/student-attempts";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;
const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded-small text-[#3D4852] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: AttemptStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return "text-[#6C63FF]";
    case "SUBMITTED":
      return "text-[#38B2AC]";
    case "GRADED":
      return "text-[#3D4852]";
  }
}

export default function StudentHistoryPage() {
  const [page, setPage] = useState(0);
  const { data, isPending, isError, error } = useMyAttemptsQuery(page, PAGE_SIZE);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
            My attempts
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            Your exam attempt history.
          </p>
        </div>
        <Link
          href="/sessions"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
        >
          Available sessions
        </Link>
      </div>

      <div className="rounded-container bg-[#E0E5EC] p-4 shadow-extruded sm:p-6">
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="mb-3 px-1 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                Attempts ({items.length})
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[#6B7280]">
                  <th scope="col" className="px-3 pb-3 font-semibold">Session</th>
                  <th scope="col" className="px-3 pb-3 text-center font-semibold">#</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Started</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Deadline</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.attemptId} className="align-top text-[#3D4852]">
                    <td className="px-3 py-3">
                      <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 font-mono text-xs shadow-inset-small">
                        {a.sessionCode}
                      </span>
                      <span className="mt-1 block text-xs text-[#6B7280]">{a.sessionTitle}</span>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-[#6B7280]">
                      {a.attemptNumber ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-bold uppercase tracking-wide ${statusTone(a.status)}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#6B7280]">{formatDateTime(a.startedAt)}</td>
                    <td className="px-3 py-3 text-[#6B7280]">{formatDateTime(a.submittedAt)}</td>
                    <td className="px-3 py-3 text-[#6B7280]">{formatDateTime(a.deadlineAt)}</td>
                    <td className="px-3 py-3 text-[#6B7280]">{formatDateTime(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isPending && !isError && items.length > 0 && (
          <div className="mt-4 flex items-center justify-between px-1 pt-4">
            <p className="text-xs font-medium text-[#6B7280]" aria-live="polite">
              {totalElements} attempt{totalElements === 1 ? "" : "s"} · Page {page + 1} of {Math.max(totalPages, 1)}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 0} aria-label="Previous page" className={pageBtnClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} aria-label="Next page" className={pageBtnClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading attempts" className="space-y-3 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-2xl bg-[#E0E5EC] shadow-inset-small" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "ATTEMPT_ACCESS_DENIED":
        message = "You don't have access to attempt history.";
        break;
      case "ATTEMPT_STUDENT_PROFILE_NOT_FOUND":
        message = "Your student profile wasn't found. Please contact your school.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load your attempts.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-[#E0E5EC] p-5 text-sm font-medium text-[#3D4852] shadow-inset-deep">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E0E5EC] text-[#6B7280] shadow-inset-deep">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 6.75h.008v.008H9V6.75Zm7.5-3.75H7.5A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h9a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 16.5 3.75Z" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">No attempts yet</p>
      <p className="mt-1 text-sm text-[#6B7280]">Your exam attempts will appear here.</p>
    </div>
  );
}
