"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useExamSessionsQuery } from "@/hooks/queries/use-exam-sessions";
import { Badge, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { ExamSessionListItem, ExamSessionStatus } from "@/lib/api/exam-sessions";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const selectClass =
  "h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 group hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_OPTIONS: ExamSessionStatus[] = ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "CANCELLED"];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusVariant(status: ExamSessionStatus): "success" | "accent" | "warn" | "default" {
  switch (status) {
    case "OPEN":
      return "success";
    case "SCHEDULED":
      return "accent";
    case "DRAFT":
      return "warn";
    default:
      return "default";
  }
}

export default function ExamSessionsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ExamSessionStatus | "">("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const params = useMemo(
    () => ({
      page,
      size: PAGE_SIZE,
      search: search || undefined,
      status: status || undefined,
      sort: "createdAt,desc",
    }),
    [page, search, status]
  );

  const { data, isPending, isError, error } = useExamSessionsQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            Exam sessions
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Schedule and run exam sessions from published versions.
          </p>
        </div>
        <Link
          href="/exam-sessions/new"
          className={cn(buttonVariants({ variant: "primary" }), "gap-1.5")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create session
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="session-search" className="sr-only">
            Search sessions by title or code
          </label>
          <Input
            id="session-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search sessions…"
            className="h-11"
          />
        </div>
        <div>
          <label htmlFor="session-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="session-status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ExamSessionStatus | "");
              setPage(0);
            }}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <ListSkeleton label="Loading exam sessions" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!search || !!status} />
        ) : (
          <SessionsTable items={items} />
        )}

        {!isPending && !isError && items.length > 0 && (
          <Pagination page={page} totalPages={totalPages} totalElements={totalElements} onPage={setPage} />
        )}
      </div>
    </div>
  );
}

function SessionsTable({ items }: { items: ExamSessionListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Title</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Exam</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Version</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Start</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">End</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Max</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Part.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="relative border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                  {s.code}
                </span>
              </td>
              <td className="px-3 py-3 font-semibold transition-colors group-hover:text-[#0052FF]">
                <Link
                  href={`/exam-sessions/${s.id}`}
                  className="after:absolute after:inset-0 rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                >
                  {s.title}
                </Link>
              </td>
              <td className="px-3 py-3 text-center text-[#64748B]">#{s.examId}</td>
              <td className="px-3 py-3 text-center text-[#64748B]">v{s.examVersionNumber}</td>
              <td className="px-3 py-3 text-center">
                <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
              </td>
              <td className="px-3 py-3 text-center text-[#64748B]">{formatDateTime(s.startsAt)}</td>
              <td className="px-3 py-3 text-center text-[#64748B]">{formatDateTime(s.endsAt)}</td>
              <td className="px-3 py-3 text-center tabular-nums text-[#64748B]">{s.maxAttempts}</td>
              <td className="px-3 py-3 text-center tabular-nums text-[#64748B]">{s.participantCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-3 py-2">
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
      case "EXAM_SESSION_ACCESS_DENIED":
      case "EXAM_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to exam sessions, or your teacher profile is missing. Please contact your administrator.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load exam sessions. Please try again.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection and try again.";
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

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0V18a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 18v.75m-18 0h18M12 9v3m1.5-1.5h-3" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">No exam sessions</p>
      <p className="mt-1 text-sm text-[#64748B]">
        {hasFilters ? "No sessions match your filters." : "Sessions you create will appear here."}
      </p>
    </div>
  );
}

function Pagination({ page, totalPages, totalElements, onPage }: { page: number; totalPages: number; totalElements: number; onPage: (p: number) => void }) {
  const prevDisabled = page <= 0;
  const nextDisabled = page >= totalPages - 1;
  return (
    <div className="mt-4 flex items-center justify-between px-1 pt-4">
      <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
        {totalElements} session{totalElements === 1 ? "" : "s"} · Page {page + 1} of {Math.max(totalPages, 1)}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPage(page - 1)} disabled={prevDisabled} aria-label="Previous page" className={pageBtnClass}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={nextDisabled} aria-label="Next page" className={pageBtnClass}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
