"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useExamSessionsQuery } from "@/hooks/queries/use-exam-sessions";
import type { ExamSessionListItem, ExamSessionStatus } from "@/lib/api/exam-sessions";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const inputClass =
  "w-full h-11 rounded-2xl bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const selectClass =
  "h-11 w-full rounded-2xl bg-[#E0E5EC] px-4 pr-9 text-sm text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded-small text-[#3D4852] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-extruded-small";

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

function statusTone(status: ExamSessionStatus): string {
  switch (status) {
    case "OPEN":
      return "text-[#38B2AC]";
    case "CANCELLED":
    case "CLOSED":
      return "text-[#A0AEC0]";
    default:
      return "text-[#6C63FF]";
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

  const { data, isPending, isError, error, isFetching } = useExamSessionsQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
            Exam sessions
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            Schedule and run exam sessions from published versions.
          </p>
        </div>
        <Link
          href="/exam-sessions/new"
          className="neumorphic-active-press inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
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
          <input
            id="session-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search sessions…"
            className={inputClass}
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

      <div className="rounded-container bg-[#E0E5EC] p-4 shadow-extruded sm:p-6">
        {isPending ? (
          <ListSkeleton label="Loading exam sessions" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!search || !!status} />
        ) : (
          <SessionsTable items={items} refreshing={isFetching} />
        )}

        {!isPending && !isError && items.length > 0 && (
          <Pagination page={page} totalPages={totalPages} totalElements={totalElements} onPage={setPage} />
        )}
      </div>
    </div>
  );
}

function SessionsTable({ items, refreshing }: { items: ExamSessionListItem[]; refreshing: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-3 flex items-center gap-2 px-1 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          <span>Your sessions ({items.length})</span>
          {refreshing && (
            <span role="status" aria-label="Updating" className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#6C63FF]" />
          )}
        </caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[#6B7280]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Title</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Exam</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Window</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Max</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Part.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="align-top text-[#3D4852]">
              <td className="px-3 py-3">
                <Link
                  href={`/exam-sessions/${s.id}`}
                  className="rounded-inner font-semibold text-[#3D4852] outline-none transition-all duration-300 hover:text-[#6C63FF] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
                >
                  <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 font-mono text-xs shadow-inset-small">
                    {s.code}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3 font-semibold">{s.title}</td>
              <td className="px-3 py-3 text-[#6B7280]">
                exam #{s.examId} · v{s.examVersionNumber}
              </td>
              <td className="px-3 py-3">
                <span className={`text-xs font-bold uppercase tracking-wide ${statusTone(s.status)}`}>
                  {s.status}
                </span>
              </td>
              <td className="px-3 py-3 text-[#6B7280]">
                {formatDateTime(s.startsAt)} → {formatDateTime(s.endsAt)}
              </td>
              <td className="px-3 py-3 text-center tabular-nums text-[#6B7280]">{s.maxAttempts}</td>
              <td className="px-3 py-3 text-center tabular-nums text-[#6B7280]">{s.participantCount}</td>
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
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-[#E0E5EC] p-5 text-sm font-medium text-[#3D4852] shadow-inset-deep">
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E0E5EC] text-[#6B7280] shadow-inset-deep">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0V18a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 18v.75m-18 0h18M12 9v3m1.5-1.5h-3" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">No exam sessions</p>
      <p className="mt-1 text-sm text-[#6B7280]">
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
      <p className="text-xs font-medium text-[#6B7280]" aria-live="polite">
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
