"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuestionBanksQuery } from "@/hooks/queries/use-question-banks";
import type { QuestionBankListItem } from "@/lib/api/question-banks";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const inputClass =
  "w-full h-11 rounded-2xl bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded-small text-[#3D4852] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-extruded-small";

function formatDate(iso: string): string {
  // useQuery data renders client-only (post-hydration) → safe to format here.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function QuestionBanksPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Debounce search 300ms; reset to first page when the query changes.
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
      sort: "createdAt,desc",
    }),
    [page, search]
  );

  const { data, isPending, isError, error, isFetching } =
    useQuestionBanksQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
            Question Banks
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            Browse and manage your question collections.
          </p>
        </div>
        <Link
          href="/question-banks/new"
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
          Create bank
        </Link>
      </div>

      <div className="mb-6">
        <label htmlFor="bank-search" className="sr-only">
          Search question banks by name or code
        </label>
        <input
          id="bank-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or code…"
          className={inputClass}
        />
      </div>

      <div className="rounded-container bg-[#E0E5EC] p-4 shadow-extruded sm:p-6">
        {isPending ? (
          <ListSkeleton label="Loading question banks" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <BanksTable items={items} refreshing={isFetching} />
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

function BanksTable({
  items,
  refreshing,
}: {
  items: QuestionBankListItem[];
  refreshing: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-3 flex items-center gap-2 px-1 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          <span>Your question banks ({items.length})</span>
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
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Subject</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Questions</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((bank) => (
            <tr key={bank.id} className="text-[#3D4852]">
              <td className="px-3 py-3 align-top">
                <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 font-mono text-xs shadow-inset-small">
                  {bank.code}
                </span>
              </td>
              <td className="px-3 py-3 align-top">
                <Link
                  href={`/question-banks/${bank.id}`}
                  className="rounded-inner font-semibold text-[#3D4852] outline-none transition-all duration-300 hover:text-[#6C63FF] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
                >
                  {bank.name}
                </Link>
                {bank.description ? (
                  <span className="mt-0.5 block max-w-md truncate text-xs text-[#6B7280]">
                    {bank.description}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 align-top text-[#6B7280]">{bank.subject.name}</td>
              <td className="px-3 py-3 text-right align-top font-semibold tabular-nums">
                {bank.questionCount}
              </td>
              <td className="px-3 py-3 align-top text-[#6B7280]">
                {formatDate(bank.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="space-y-3 py-2"
    >
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
      case "QUESTION_BANK_ACCESS_DENIED":
      case "QUESTION_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to question banks. Please contact your administrator.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load question banks. Please try again.";
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

function EmptyState({ search }: { search: string }) {
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
            d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">
        No question banks yet
      </p>
      <p className="mt-1 text-sm text-[#6B7280]">
        {search
          ? `No banks match “${search}”.`
          : "Question banks you create will appear here."}
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
        {totalElements} bank{totalElements === 1 ? "" : "s"} · Page {page + 1} of{" "}
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
