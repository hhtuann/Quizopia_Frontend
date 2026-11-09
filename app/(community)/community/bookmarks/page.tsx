"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMyBookmarksQuery,
  useRemoveBookmarkMutation,
} from "@/hooks/queries/use-community-bookmarks";
import {
  DEFAULT_BOOKMARK_PAGE_SIZE,
  type SavedPublicationCard,
} from "@/lib/api/community-bookmarks";
import type { NormalizedApiError } from "@/lib/api";
import { Badge, Button, Card, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { describeBookmarkError } from "@/components/community/community-errors";
import { CommunitySectionNav } from "@/components/community/CommunitySectionNav";

/**
 * Saved quizzes collection (P3-B1-FE, issue #46 — ADR-006 §7/§10).
 *
 * Lives in the role-free `(community)` group (AuthenticatedShell, page-level
 * RequireAuth WITHOUT a role): STUDENT and TEACHER share ONE collection, so
 * the page must not sit under the role-gated `(student)`/`(teacher)` groups.
 *
 * Safe-by-construction rendering:
 * - available entries render the §7 `PublicPublicationCard` allowlist +
 *   `savedAt` + Remove + a link to the public detail page;
 * - unavailable entries render ONLY the generic placeholder text + `savedAt`
 *   + Remove — the backend never ships stale title/alias/category/tags (§7)
 *   and this component never reads them (leak tests poison the fixture to
 *   prove it).
 */

const pageBtnClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface Notice {
  kind: "success" | "error";
  message: string;
}

const NOTICE_STYLES: Record<Notice["kind"], string> = {
  success: "border-[#10B981]/30 bg-[#10B981]/5 text-[#0F172A]",
  error: "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SavedQuizzesPage() {
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const { data, isPending, isError, error, refetch } = useMyBookmarksQuery({
    page,
    size: DEFAULT_BOOKMARK_PAGE_SIZE,
  });
  const removeMut = useRemoveBookmarkMutation();
  const totalPages = data?.totalPages ?? 1;

  // Removing the only entry of the last page leaves `page` out of range once
  // the invalidation refetch lands — React's render-phase state adjustment:
  // the discard-and-rerun re-renders with the corrected page and the query
  // key follows it back to the last real page.
  if (data && data.items.length === 0 && page > 0) {
    setPage(Math.max(0, totalPages - 1));
  }

  const onRemove = async (publicationId: number) => {
    setNotice(null);
    try {
      await removeMut.mutateAsync(publicationId);
      setNotice({ kind: "success", message: "Removed from your collection." });
    } catch (err) {
      setNotice({ kind: "error", message: describeBookmarkError(err) });
    }
  };

  const items = data?.items ?? [];
  const totalElements = data?.totalElements ?? 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/community"
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
            Browse the community
          </Link>
          <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            Saved <span className="gradient-text">quizzes</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Community quizzes you saved — the same collection follows your
            account in the student and teacher views.
          </p>
        </div>
      </div>

      <CommunitySectionNav current="saved" />

      {notice && (
        <div
          role={notice.kind === "success" ? "status" : "alert"}
          className={cn(
            "mb-6 flex items-start gap-2 rounded-lg border p-4 text-sm font-medium",
            NOTICE_STYLES[notice.kind]
          )}
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
          <span>{notice.message}</span>
        </div>
      )}

      <section aria-label="Saved quizzes" aria-busy={isPending}>
        {isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading saved quizzes"
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
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-16 text-center"
          >
            <p className="font-display text-lg font-bold text-[#0F172A]">
              Couldn&apos;t load your saved quizzes
            </p>
            <p className="mt-1 text-sm text-[#64748B]">
              {(error as unknown as NormalizedApiError | undefined)?.kind ===
              "network"
                ? "Network error — check your connection and try again."
                : "Something went wrong. Please try again."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-5 h-11"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
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
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                />
              </svg>
            </div>
            <p className="font-display text-lg font-bold text-[#0F172A]">
              No saved quizzes yet
            </p>
            <p className="mt-1 text-sm text-[#64748B]">
              Find a quiz on the community catalog and save it — it will show
              up here.
            </p>
            <Link
              href="/community"
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-5 h-11")}
            >
              Browse the community
            </Link>
          </div>
        ) : (
          <>
            <div className="adaptive-grid">
              {items.map((entry) =>
                entry.unavailable ? (
                  <UnavailableCard
                    key={entry.publicationId}
                    savedAt={entry.savedAt}
                    removing={
                      removeMut.isPending &&
                      removeMut.variables === entry.publicationId
                    }
                    onRemove={() => onRemove(entry.publicationId)}
                  />
                ) : (
                  <SavedCard
                    key={entry.publicationId}
                    item={entry}
                    removing={
                      removeMut.isPending &&
                      removeMut.variables === entry.publicationId
                    }
                    onRemove={() => onRemove(entry.publicationId)}
                  />
                )
              )}
            </div>

            <div className="mt-6 flex items-center justify-between px-1 pt-4">
              <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
                {totalElements} saved quiz{totalElements === 1 ? "" : "zes"} ·{" "}
                Page {page + 1} of {Math.max(totalPages, 1)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page <= 0}
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
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
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
          </>
        )}
      </section>
    </div>
  );
}

/** Available saved quiz — the §7 public card allowlist + saved date + Remove. */
function SavedCard({
  item,
  removing,
  onRemove,
}: {
  item: SavedPublicationCard;
  removing: boolean;
  onRemove: () => void;
}) {
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
        · Saved {formatDate(item.savedAt)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 h-11"
        onClick={onRemove}
        disabled={removing}
        aria-busy={removing}
      >
        {removing ? "Removing…" : "Remove"}
      </Button>
    </Card>
  );
}

/**
 * Unavailable saved quiz — generic placeholder + saved date + Remove ONLY
 * (§7: the entry ships no other fields; nothing else is ever consumed even
 * if a hostile/stale payload smuggles them in).
 */
function UnavailableCard({
  savedAt,
  removing,
  onRemove,
}: {
  savedAt: string;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <Card className="flex h-full flex-col p-6">
      <Badge variant="warn">Unavailable</Badge>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-[#64748B]">
        This quiz is no longer available
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
        It may have been unpublished or removed by its author.
      </p>
      <p className="mt-auto pt-4 text-xs text-[#64748B]">
        Saved {formatDate(savedAt)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 h-11"
        onClick={onRemove}
        disabled={removing}
        aria-busy={removing}
      >
        {removing ? "Removing…" : "Remove"}
      </Button>
    </Card>
  );
}
