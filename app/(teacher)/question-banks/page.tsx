"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuestionBanksQuery } from "@/hooks/queries/use-question-banks";
import { Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { QuestionBankListItem } from "@/lib/api/question-banks";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 group hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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

  const { data, isPending, isError, error } =
    useQuestionBanksQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            Question Banks
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Browse and manage your question collections.
          </p>
        </div>
        <Link
          href="/question-banks/new"
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
          Create bank
        </Link>
      </div>

      <div className="mb-6">
        <label htmlFor="bank-search" className="sr-only">
          Search question banks by name or code
        </label>
        <Input
          id="bank-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or code…"
          className="h-11"
        />
      </div>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <ListSkeleton label="Loading question banks" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <BanksTable items={items} />
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
}: {
  items: QuestionBankListItem[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Subject</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Questions</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((bank) => (
            <tr key={bank.id} className="relative border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3 align-top">
                <Link
                  href={`/question-banks/${bank.id}`}
                  className="after:absolute after:inset-0 rounded font-semibold text-[#0F172A] outline-none transition-colors group-hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                >
                  {bank.name}
                </Link>
                {bank.description ? (
                  <span className="mt-0.5 block max-w-md truncate text-xs text-[#64748B]">
                    {bank.description}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 align-top text-[#64748B]">{bank.subject.name}</td>
              <td className="px-3 py-3 text-right align-top font-semibold tabular-nums">
                {bank.questionCount}
              </td>
              <td className="px-3 py-3 align-top text-[#64748B]">
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

function EmptyState({ search }: { search: string }) {
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
            d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">
        No question banks yet
      </p>
      <p className="mt-1 text-sm text-[#64748B]">
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
      <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
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
