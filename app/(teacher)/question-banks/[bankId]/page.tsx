"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useBankQuestionsQuery } from "@/hooks/queries/use-question-banks";
import { QuestionImport } from "@/components/teacher/QuestionImport";
import type {
  Difficulty,
  QuestionStatus,
  QuestionSummary,
  QuestionType,
} from "@/lib/api/question-banks";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 10;

const inputClass =
  "w-full h-11 rounded-2xl bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const selectClass =
  "h-11 rounded-2xl bg-[#E0E5EC] px-4 pr-9 text-sm text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded-small text-[#3D4852] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-extruded-small";

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

  const { data, isPending, isError, error, isFetching } = useBankQuestionsQuery(
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
          className="inline-flex items-center gap-1.5 rounded-inner text-xs font-semibold uppercase tracking-wider text-[#6B7280] outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
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
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
          Questions
        </h1>
        <p className="mt-2 text-sm font-medium text-[#6B7280]">
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
          <input
            id="q-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search questions…"
            className={inputClass}
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

      <div className="rounded-container bg-[#E0E5EC] p-4 shadow-extruded sm:p-6">
        {!validId ? (
          <NotFound />
        ) : isPending ? (
          <ListSkeleton label="Loading questions" />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!search || !!type || !!status} />
        ) : (
          <QuestionsTable items={items} refreshing={isFetching} />
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

function QuestionsTable({
  items,
  refreshing,
}: {
  items: QuestionSummary[];
  refreshing: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-3 flex items-center gap-2 px-1 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          <span>Questions ({items.length})</span>
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
            <tr key={q.id} className="align-top text-[#3D4852]">
              <td className="px-3 py-3">
                <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 font-mono text-xs shadow-inset-small">
                  {q.code}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 text-xs font-semibold shadow-inset-small">
                  {TYPE_LABEL[q.questionType]}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className="block max-w-sm text-[#3D4852] line-clamp-2">
                  {q.content}
                </span>
              </td>
              <td className="px-3 py-3 capitalize text-[#6B7280]">
                {(q.difficulty as Difficulty).toLowerCase()}
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">
                {q.defaultPoints}
              </td>
              <td className="px-3 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  {q.status}
                </span>
              </td>
              <td className="px-3 py-3 text-[#6B7280]">{formatDate(q.createdAt)}</td>
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
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">
        Question bank not found
      </p>
      <p className="mt-1 text-sm text-[#6B7280]">
        This bank may have been removed or you don&apos;t have access to it.
      </p>
      <Link
        href="/question-banks"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
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
          className="h-12 animate-pulse rounded-2xl bg-[#E0E5EC] shadow-inset-small"
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
        className="flex w-full items-start gap-3 rounded-2xl bg-[#E0E5EC] p-5 text-sm font-medium text-[#3D4852] shadow-inset-deep"
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
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
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
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">No questions here</p>
      <p className="mt-1 text-sm text-[#6B7280]">
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
      <p className="text-xs font-medium text-[#6B7280]" aria-live="polite">
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
