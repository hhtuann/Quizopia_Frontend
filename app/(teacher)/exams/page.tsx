"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useExamsQuery } from "@/hooks/queries/use-exams";
import { useSubjectsQuery } from "@/hooks/queries/use-subjects";
import type { ExamListItem, ExamStatus } from "@/lib/api/exams";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const inputClass =
  "w-full h-11 rounded-2xl bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const selectClass =
  "h-11 w-full rounded-2xl bg-[#E0E5EC] px-4 pr-9 text-sm text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded-small text-[#3D4852] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-extruded-small";

const STATUS_OPTIONS: ExamStatus[] = ["DRAFT", "READY"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ExamsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [status, setStatus] = useState<ExamStatus | "">("");
  const [page, setPage] = useState(0);

  const { data: subjectsData } = useSubjectsQuery();
  const subjects = subjectsData?.items ?? [];

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
      subjectId: subjectId || undefined,
      status: status || undefined,
      sort: "createdAt,desc",
    }),
    [page, search, subjectId, status]
  );

  const { data, isPending, isError, error, isFetching } = useExamsQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
            Exams
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            Browse and manage your exams.
          </p>
        </div>
        <Link
          href="/exams/new"
          className="neumorphic-active-press inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create exam
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label htmlFor="exam-search" className="sr-only">
            Search exams by title or code
          </label>
          <input
            id="exam-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search exams…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="exam-subject-filter" className="sr-only">
            Filter by subject
          </label>
          <select
            id="exam-subject-filter"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value === "" ? "" : Number(e.target.value));
              setPage(0);
            }}
            className={selectClass}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="exam-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="exam-status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ExamStatus | "");
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
          <ListSkeleton label="Loading exams" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!search || !!subjectId || !!status} />
        ) : (
          <ExamsTable items={items} refreshing={isFetching} />
        )}

        {!isPending && !isError && items.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalElements}
            onPage={setPage}
          />
        )}
      </div>
    </div>
  );
}

function ExamsTable({ items, refreshing }: { items: ExamListItem[]; refreshing: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-3 flex items-center gap-2 px-1 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          <span>Your exams ({items.length})</span>
          {refreshing && (
            <span
              role="status"
              aria-label="Updating"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#6C63FF]"
            />
          )}
        </caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[#6B7280]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Title</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Subject</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Purpose</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 text-center font-semibold">Ver.</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Flags</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((exam) => (
            <tr key={exam.id} className="align-top text-[#3D4852]">
              <td className="px-3 py-3">
                <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 font-mono text-xs shadow-inset-small">
                  {exam.code}
                </span>
              </td>
              <td className="px-3 py-3 font-semibold">{exam.title}</td>
              <td className="px-3 py-3 text-[#6B7280]">
                {exam.subject.code} — {exam.subject.name}
              </td>
              <td className="px-3 py-3 text-[#6B7280]">
                {exam.purpose ? exam.purpose.title : "—"}
              </td>
              <td className="px-3 py-3">
                <span
              className={`rounded-inner bg-[#E0E5EC] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-inset-small ${
                    exam.status === "READY" ? "text-[#38B2AC]" : "text-[#6B7280]"
                  }`}
                >
                  {exam.status}
                </span>
              </td>
              <td className="px-3 py-3 text-center tabular-nums text-[#6B7280]">
                {exam.currentVersionNumber ?? "—"}
              </td>
              <td className="px-3 py-3">
                <div className="flex gap-1.5" aria-label={`draft ${exam.hasDraft ? "yes" : "no"}, published ${exam.hasPublished ? "yes" : "no"}`}>
                  <VersionDot label="D" active={exam.hasDraft} hint="has draft" />
                  <VersionDot label="P" active={exam.hasPublished} hint="has published" />
                </div>
              </td>
              <td className="px-3 py-3 text-[#6B7280]">{formatDate(exam.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VersionDot({ label, active, hint }: { label: string; active: boolean; hint: string }) {
  return (
    <span
      title={hint}
      aria-hidden="true"
      className={`inline-flex h-5 w-5 items-center justify-center rounded-inner text-[10px] font-bold ${
        active
          ? "bg-[#E0E5EC] text-[#6C63FF] shadow-inset-small"
          : "bg-[#E0E5EC] text-[#A0AEC0] shadow-inset-small opacity-60"
      }`}
    >
      {label}
    </span>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-3 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-2xl bg-[#E0E5EC] shadow-inset-small"
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "EXAM_ACCESS_DENIED":
      case "EXAM_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to exams, or your teacher profile is missing. Please contact your administrator.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load exams. Please try again.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection and try again.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl bg-[#E0E5EC] p-5 text-sm font-medium text-[#3D4852] shadow-inset-deep"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E0E5EC] text-[#6B7280] shadow-inset-deep">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 6.75h.008v.008H9V6.75Zm7.5-3.75H7.5A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h9a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 16.5 3.75Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">No exams yet</p>
      <p className="mt-1 text-sm text-[#6B7280]">
        {hasFilters ? "No exams match your filters." : "Exams you create will appear here."}
      </p>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalElements,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalElements: number;
  onPage: (p: number) => void;
}) {
  const prevDisabled = page <= 0;
  const nextDisabled = page >= totalPages - 1;
  return (
    <div className="mt-4 flex items-center justify-between px-1 pt-4">
      <p className="text-xs font-medium text-[#6B7280]" aria-live="polite">
        {totalElements} exam{totalElements === 1 ? "" : "s"} · Page {page + 1} of{" "}
        {Math.max(totalPages, 1)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={prevDisabled}
          aria-label="Previous page"
          className={pageBtnClass}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={nextDisabled}
          aria-label="Next page"
          className={pageBtnClass}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
