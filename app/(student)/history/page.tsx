"use client";

import { useState } from "react";
import Link from "next/link";
import { useMyAttemptsQuery } from "@/hooks/queries/use-student-attempts";
import { Badge, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { AttemptStatus } from "@/lib/api/student-attempts";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;
const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 group hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function statusVariant(status: AttemptStatus): "accent" | "success" | "default" {
  switch (status) {
    case "IN_PROGRESS":
      return "accent";
    case "SUBMITTED":
      return "success";
    case "GRADED":
      return "default";
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
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            My attempts
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Your exam attempt history.
          </p>
        </div>
        <Link href="/sessions" className={buttonVariants({ variant: "outline" })}>
          Available sessions
        </Link>
      </div>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
                  <th scope="col" className="px-3 pb-3 font-semibold">Session</th>
                  <th scope="col" className="px-3 pb-3 text-center font-semibold">#</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Started</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Submitted</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Deadline</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
                  <th scope="col" className="px-3 pb-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.attemptId} className="relative border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
                    <td className="px-3 py-3">
                      <Link
                        href={a.status === "SUBMITTED" || a.status === "GRADED"
                          ? `/attempts/${a.attemptId}/result`
                          : `/attempts/${a.attemptId}`}
                        className="after:absolute after:inset-0 transition-colors group-hover:text-[#0052FF]"
                        aria-label={`Open ${a.sessionTitle}`}
                      >
                        <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                          {a.sessionCode}
                        </span>
                      </Link>
                      <span className="mt-1 block text-xs text-[#64748B]">{a.sessionTitle}</span>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-[#64748B]">
                      {a.attemptNumber ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant(a.status)}>{a.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-3 py-3 text-[#64748B]">{formatDateTime(a.startedAt)}</td>
                    <td className="px-3 py-3 text-[#64748B]">{formatDateTime(a.submittedAt)}</td>
                    <td className="px-3 py-3 text-[#64748B]">{formatDateTime(a.deadlineAt)}</td>
                    <td className="px-3 py-3 text-[#64748B]">{formatDateTime(a.createdAt)}</td>
                    <td className="px-3 py-3">
                      {(a.status === "SUBMITTED" || a.status === "GRADED") && (
                        <Link
                          href={`/attempts/${a.attemptId}/result`}
                          className="inline-flex items-center gap-1 rounded text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                        >
                          View result →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isPending && !isError && items.length > 0 && (
          <div className="mt-4 flex items-center justify-between px-1 pt-4">
            <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
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
        <div key={i} className="h-12 animate-pulse rounded-lg bg-[#F1F5F9]" />
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
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]">
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 6.75h.008v.008H9V6.75Zm7.5-3.75H7.5A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h9a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 16.5 3.75Z" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">No attempts yet</p>
      <p className="mt-1 text-sm text-[#64748B]">Your exam attempts will appear here.</p>
    </div>
  );
}
