"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useExamsQuery } from "@/hooks/queries/use-exams";
import { useSubjectsQuery } from "@/hooks/queries/use-subjects";
import { Badge, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { ExamListItem, ExamStatus } from "@/lib/api/exams";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const selectClass =
  "h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 group hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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

  const { data, isPending, isError, error } = useExamsQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            Exams
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Browse and manage your exams.
          </p>
        </div>
        <Link
          href="/exams/new"
          className={cn(buttonVariants({ variant: "primary" }), "gap-1.5")}
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
          <Input
            id="exam-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search exams…"
            className="h-11"
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

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <ListSkeleton label="Loading exams" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!search || !!subjectId || !!status} />
        ) : (
          <ExamsTable items={items} />
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

function ExamsTable({ items }: { items: ExamListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
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
            <tr key={exam.id} className="relative border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3 font-semibold transition-colors group-hover:text-[#0052FF]">
                <Link href={`/exams/${exam.id}`} className="after:absolute after:inset-0 transition-colors group-hover:text-[#0052FF]">
                  {exam.title}
                </Link>
              </td>
              <td className="px-3 py-3 text-[#64748B]">
                {exam.subject.code} — {exam.subject.name}
              </td>
              <td className="px-3 py-3 text-[#64748B]">
                {exam.purpose ? exam.purpose.title : "—"}
              </td>
              <td className="px-3 py-3">
                <Badge variant={exam.status === "READY" ? "success" : "default"}>
                  {exam.status}
                </Badge>
              </td>
              <td className="px-3 py-3 text-center tabular-nums text-[#64748B]">
                {exam.currentVersionNumber ?? "—"}
              </td>
              <td className="px-3 py-3">
                <div className="flex gap-1.5" aria-label={`draft ${exam.hasDraft ? "yes" : "no"}, published ${exam.hasPublished ? "yes" : "no"}`}>
                  <VersionDot label="D" active={exam.hasDraft} hint="has draft" />
                  <VersionDot label="P" active={exam.hasPublished} hint="has published" />
                </div>
              </td>
              <td className="px-3 py-3 text-[#64748B]">{formatDate(exam.createdAt)}</td>
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
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold",
        active
          ? "bg-[#0052FF]/10 text-[#0052FF]"
          : "bg-[#F1F5F9] text-[#94A3B8] opacity-60"
      )}
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
          className="h-12 animate-pulse rounded-lg bg-[#F1F5F9]"
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
      className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]"
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
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
      <p className="font-display text-lg font-bold text-[#0F172A]">No exams yet</p>
      <p className="mt-1 text-sm text-[#64748B]">
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
      <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
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
