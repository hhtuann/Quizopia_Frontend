"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useBankQuestionsQuery } from "@/hooks/queries/use-question-banks";
import { QuestionImport } from "@/components/teacher/QuestionImport";
import { Badge, Input, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type {
  Difficulty,
  QuestionStatus,
  QuestionSummary,
  QuestionType,
} from "@/lib/api/question-banks";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const selectClass =
  "h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 group hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE_MATRIX: "True/False",
  NUMERIC_FILL: "Numeric",
};

const TYPE_OPTIONS: QuestionType[] = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_MATRIX",
  "NUMERIC_FILL",
];

const STATUS_OPTIONS: QuestionStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BankQuestionsPage() {
  const { bankId } = useParams<{ bankId: string }>();
  const bankIdNum = Number(bankId);
  const validId = Number.isFinite(bankIdNum);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<QuestionType | "">("");
  const [status, setStatus] = useState<QuestionStatus | "">("");
  const [page, setPage] = useState(0);

  // Debounce search; any filter change resets to page 0.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const onFilterChange = () => setPage(0);

  const params = useMemo(
    () => ({
      page,
      size: PAGE_SIZE,
      type: type || undefined,
      status: status || undefined,
      search: search || undefined,
    }),
    [page, type, status, search]
  );

  const { data, isPending, isError, error } = useBankQuestionsQuery(
    bankIdNum,
    params,
    validId
  );
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/question-banks"
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All banks
        </Link>
        <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Questions
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Question bank <span className="font-mono">#{validId ? bankIdNum : "?"}</span>
        </p>
      </div>

      {validId && (
        <div className="mb-6">
          <QuestionImport bankId={bankIdNum} />
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label htmlFor="q-search" className="sr-only">
            Search questions by content or code
          </label>
          <Input
            id="q-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search questions…"
            className="h-11"
          />
        </div>
        <div>
          <label htmlFor="q-type" className="sr-only">
            Filter by question type
          </label>
          <select
            id="q-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as QuestionType | "");
              onFilterChange();
            }}
            className={selectClass}
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="q-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as QuestionStatus | "");
              onFilterChange();
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
        {!validId ? (
          <NotFound />
        ) : isPending ? (
          <ListSkeleton label="Loading questions" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!search || !!type || !!status} />
        ) : (
          <QuestionsTable items={items} />
        )}

        {validId && !isPending && !isError && items.length > 0 && (
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

function statusVariant(status: QuestionStatus): "default" | "success" | "warn" {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warn";
  return "default";
}

function QuestionsTable({
  items,
}: {
  items: QuestionSummary[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Type</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Content</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Difficulty</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Points</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((q) => (
            <tr key={q.id} className="border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                  {q.code}
                </span>
              </td>
              <td className="px-3 py-3">
                <Badge variant="accent">{TYPE_LABEL[q.questionType]}</Badge>
              </td>
              <td className="px-3 py-3">
                <span className="block max-w-sm text-[#0F172A] line-clamp-2">
                  {q.content}
                </span>
              </td>
              <td className="px-3 py-3 capitalize text-[#64748B]">
                {(q.difficulty as Difficulty).toLowerCase()}
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">
                {q.defaultPoints}
              </td>
              <td className="px-3 py-3">
                <Badge variant={statusVariant(q.status)}>{q.status}</Badge>
              </td>
              <td className="px-3 py-3 text-[#64748B]">{formatDate(q.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotFound() {
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
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">
        Question bank not found
      </p>
      <p className="mt-1 text-sm text-[#64748B]">
        This bank may have been removed or you don&apos;t have access to it.
      </p>
      <Link
        href="/question-banks"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
      >
        Back to banks
      </Link>
    </div>
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
  let showBack = false;
  if (error?.kind === "api") {
    switch (error.code) {
      case "QUESTION_BANK_NOT_FOUND":
        message = "This question bank could not be found.";
        showBack = true;
        break;
      case "QUESTION_BANK_ACCESS_DENIED":
      case "QUESTION_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to this question bank.";
        showBack = true;
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load questions. Please try again.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection and try again.";
  } else {
    message = "Something went wrong. Please try again.";
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div
        role="alert"
        className="flex w-full items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]"
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
      {showBack && (
        <Link
          href="/question-banks"
          className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          Back to banks
        </Link>
      )}
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
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">No questions here</p>
      <p className="mt-1 text-sm text-[#64748B]">
        {hasFilters
          ? "No questions match your filters."
          : "This question bank has no questions yet."}
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
        {totalElements} question{totalElements === 1 ? "" : "s"} · Page {page + 1} of{" "}
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
