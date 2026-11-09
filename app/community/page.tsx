"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCommunityCategoriesQuery,
  useCommunityPublicationsQuery,
  useCommunityTagsQuery,
} from "@/hooks/queries/use-community";
import { Badge, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { CommunitySectionNav } from "@/components/community/CommunitySectionNav";
import type { PublicPublicationCard } from "@/lib/api/community";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Public Community explore page (P3-A-FE1, issue #43 — ADR-006 §7/§10).
 *
 * Anonymous by design: no RequireAuth, no auth-dependent branches. The URL is
 * the single source of truth for filter state (`q`, `categoryId`, repeated
 * `tags`, `page`) so links are shareable, deep links land exactly on the
 * filtered catalog, and the browser back/forward buttons step through filter
 * states — every change is a `router.push`, never `replace`.
 *
 * Safe render (§10): only the §7 public-DTO allowlist is rendered, as React
 * text (escaped). No `dangerouslySetInnerHTML`, no markdown rendering, no
 * answer/option/exam-id/PII fields exist in the consumed types.
 */

const PAGE_SIZE = 12;
/** Bounded free-text search (server truncates too; this caps typing + URL). */
const SEARCH_MAX_LENGTH = 100;
/** How many `/tags` labels become chips (server returns the top 100). */
const MAX_TAG_CHIPS = 24;

const selectClass =
  "h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2 sm:w-56";

const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Committed filter state (mirrored 1:1 into the URL query string). */
interface Filters {
  q: string;
  categoryId: number | "";
  tags: string[];
  page: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CommunityExplore() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---- Committed filter state, derived from the URL (single source of truth).
  const filters = useMemo<Filters>(() => {
    const pageParam = Number(searchParams.get("page"));
    return {
      q: (searchParams.get("q") ?? "").slice(0, SEARCH_MAX_LENGTH),
      categoryId:
        /^\d+$/.test(searchParams.get("categoryId") ?? "")
          ? Number(searchParams.get("categoryId"))
          : "",
      tags: Array.from(
        new Set(
          searchParams
            .getAll("tags")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        )
      ),
      page: Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 0,
    };
  }, [searchParams]);
  const { q, categoryId, tags, page } = filters;

  // ---- Typed search input (bounded), debounced 300ms into the URL.
  // The draft is anchored to the committed `q` it was typed against, so an
  // external URL change (back/forward, deep link) supersedes it without an
  // effect-synced setState.
  const [draft, setDraft] = useState<{ q: string; value: string } | null>(null);
  const searchInput = draft && draft.q === q ? draft.value : q;
  const onSearchInput = (value: string) => setDraft({ q, value });

  /** Commit a full filter state to the URL (one history entry per change). */
  const pushFilters = useCallback(
    (next: Filters) => {
      const params = new URLSearchParams();
      if (next.q) params.set("q", next.q);
      if (next.categoryId !== "")
        params.set("categoryId", String(next.categoryId));
      for (const t of next.tags) params.append("tags", t);
      if (next.page > 0) params.set("page", String(next.page));
      const qs = params.toString();
      router.push(qs ? `/community?${qs}` : "/community");
    },
    [router]
  );

  useEffect(() => {
    const next = searchInput.trim().slice(0, SEARCH_MAX_LENGTH);
    if (next === q) return;
    const handle = setTimeout(
      () => pushFilters({ q: next, categoryId, tags, page: 0 }),
      300
    );
    return () => clearTimeout(handle);
  }, [searchInput, q, categoryId, tags, page, pushFilters]);

  // ---- Data (public, anonymous).
  const listParams = useMemo(
    () => ({
      q: q || undefined,
      categoryId: categoryId === "" ? undefined : categoryId,
      tags: tags.length > 0 ? tags : undefined,
      page,
      size: PAGE_SIZE,
    }),
    [q, categoryId, tags, page]
  );
  const { data, isPending, isError, error, isPlaceholderData } =
    useCommunityPublicationsQuery(listParams);
  const { data: categoriesData } = useCommunityCategoriesQuery();
  const { data: tagsData } = useCommunityTagsQuery();

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;
  const hasFilters = q !== "" || categoryId !== "" || tags.length > 0;

  /** Top labels from `/tags`, plus any committed-but-rare tags (deep links). */
  const tagOptions = useMemo(() => {
    const top = (tagsData ?? []).slice(0, MAX_TAG_CHIPS).map((t) => t.label);
    for (const t of tags) {
      if (!top.includes(t)) top.push(t);
    }
    return top;
  }, [tagsData, tags]);

  return (
    <div>
      <header className="mb-8 select-none">
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Community <span className="gradient-text">quizzes</span>
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Browse quizzes teachers have published for everyone. No account
          needed to explore.
        </p>
      </header>

      <CommunitySectionNav current="browse" />

      {/* Filters — every control commits to the URL (shareable deep links). */}
      <section aria-label="Filter community quizzes" className="mb-6 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="community-search" className="sr-only">
              Search community quizzes
            </label>
            <Input
              id="community-search"
              type="search"
              value={searchInput}
              maxLength={SEARCH_MAX_LENGTH}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search by title or description…"
              className="h-11"
            />
          </form>
          <div>
            <label htmlFor="community-category" className="sr-only">
              Filter by category
            </label>
            <select
              id="community-category"
              value={categoryId}
              onChange={(e) =>
                pushFilters({
                  q,
                  categoryId: e.target.value === "" ? "" : Number(e.target.value),
                  tags,
                  page: 0,
                })
              }
              className={selectClass}
            >
              <option value="">All categories</option>
              {(categoriesData ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {tagOptions.length > 0 && (
          <div
            role="group"
            aria-label="Filter by tag (all selected tags must match)"
            className="flex flex-wrap gap-2"
          >
            {tagOptions.map((label) => {
              const selected = tags.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    pushFilters({
                      q,
                      categoryId,
                      tags: selected
                        ? tags.filter((t) => t !== label)
                        : [...tags, label],
                      page: 0,
                    })
                  }
                  className={cn(
                    "inline-flex h-11 items-center rounded-full border px-4 text-xs font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
                    selected
                      ? "border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]"
                      : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0052FF]/30 hover:text-[#0F172A]"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-label="Community quiz catalog"
        aria-busy={isPending || isPlaceholderData}
      >
        {isPending ? (
          <CatalogSkeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState
            hasFilters={hasFilters}
            onClear={() => pushFilters({ q: "", categoryId: "", tags: [], page: 0 })}
          />
        ) : (
          <>
            <div className="adaptive-grid">
              {items.map((item) => (
                <PublicationCard key={item.publicationId} item={item} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              totalElements={totalElements}
              onPage={(p) => pushFilters({ q, categoryId, tags, page: p })}
            />
          </>
        )}
      </section>
    </div>
  );
}


function PublicationCard({ item }: { item: PublicPublicationCard }) {
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{item.categoryTitle ?? "Uncategorised"}</Badge>
        {item.allowFork && <Badge>Forkable</Badge>}
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-[#0F172A]">
        <Link
          href={`/community/quizzes/${item.publicationId}`}
          className="rounded outline-none transition-colors hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          {item.title}
        </Link>
      </h2>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#64748B]">
        {item.summary ?? "No description provided."}
      </p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        {item.questionCount} question{item.questionCount === 1 ? "" : "s"} ·{" "}
        {item.sectionCount} section{item.sectionCount === 1 ? "" : "s"} ·{" "}
        {item.durationMinutes} min
      </p>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}
      <p className="mt-auto pt-4 text-xs text-[#64748B]">
        by <span className="font-semibold text-[#0F172A]">{item.authorName}</span>{" "}
        · {formatDate(item.publishedAt)}
      </p>
    </Card>
  );
}

function CatalogSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading community quizzes"
      className="adaptive-grid"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]"
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  const message =
    error?.kind === "network"
      ? "Network error — check your connection and try again."
      : error?.kind === "api" && error.status === 429
        ? "Too many requests — please wait a moment and try again."
        : "Couldn't load community quizzes. Please try again.";
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

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 py-16 text-center shadow-[0_4px_6px_rgba(0,0,0,0.07)]">
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
            d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0 .075-.914M15.75 9.75A3.75 3.75 0 1 1 12 6a3.75 3.75 0 0 1 3.75 3.75Zm-3.75 0h.008v.008H12V9.75Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">
        {hasFilters ? "No quizzes match your filters" : "Nothing published yet"}
      </p>
      <p className="mt-1 text-sm text-[#64748B]">
        {hasFilters
          ? "Try a different search term, category or tag."
          : "Community quizzes will appear here as teachers publish them."}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A] outline-none transition-all duration-200 hover:border-[#0052FF]/30 hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          Clear all filters
        </button>
      )}
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
    <div className="mt-6 flex items-center justify-between px-1 pt-4">
      <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
        {totalElements} quiz{totalElements === 1 ? "" : "zes"} · Page {page + 1} of{" "}
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

export default function CommunityPage() {
  // `useSearchParams` must sit inside a Suspense boundary for static prerender.
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <CommunityExplore />
    </Suspense>
  );
}
