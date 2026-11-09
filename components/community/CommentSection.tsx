"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { CommentEditor } from "./CommentEditor";
import { CommentListItem } from "./CommentListItem";
import { classifyCommentError } from "@/lib/api/community-comments";
import {
  DEFAULT_COMMENT_PAGE_SIZE,
  useCommunityCommentsQuery,
  useMyCommentAliasesQuery,
} from "@/hooks/queries/use-community-comments";
import { useAuth } from "@/hooks/useAuth";

/**
 * Community discussion section body (P3-C4, issue #68 — ADR-007 §7).
 * Mounted by the detail page just below the action toolbar at the
 * `#discussion` anchor (the page owns the heading + live comment count).
 *
 * Guests read everything (the §5 list route is anonymous) and get a
 * `/login?returnTo` CTA instead of the editor — the #67 decision that the
 * toolbar's Comment button anchor-scrolls, never detours, keeps holding.
 *
 * States: loading skeleton, list error with retry (a 404 "gone" shows the
 * neutral no-longer-available line — the whole page refetches into its
 * not-available state via the mutation-side `["community"]` invalidation),
 * empty state, newest-first pages with `keepPreviousData` and an
 * `aria-live` page indicator. The page index clamps back when a deletion
 * empties the trailing page.
 */
export function CommentSection({
  publicationId,
  loginHref,
}: {
  publicationId: number;
  loginHref: string;
}) {
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const [page, setPage] = useState(0);

  const comments = useCommunityCommentsQuery(publicationId, {
    page,
    size: DEFAULT_COMMENT_PAGE_SIZE,
  });
  const totalPages = comments.data?.totalPages ?? 0;
  // Clamp (React's adjust-state-during-render pattern — converges in one
  // pass, no effect, no commit): a delete that empties the trailing page
  // steps `page` back to the new last page, so the QUERY KEY follows the
  // clamp and the fetch re-reads the page that still has rows.
  if (page > Math.max(0, totalPages - 1)) {
    setPage(Math.max(0, totalPages - 1));
  }

  const aliasQ = useMyCommentAliasesQuery();
  const myAliases = aliasQ.data ?? [];

  const listError = comments.error ? classifyCommentError(comments.error) : null;

  return (
    <div data-testid="comment-section" className="mt-4 space-y-4">
      {authenticated ? (
        <CommentEditor publicationId={publicationId} />
      ) : (
        <Link
          href={loginHref}
          data-testid="sign-in-to-comment"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}
        >
          Sign in to join the discussion
        </Link>
      )}

      {comments.isPending && (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading comments"
          className="space-y-3"
        >
          <div className="h-20 animate-pulse rounded-xl bg-[#F1F5F9]" />
          <div className="h-20 animate-pulse rounded-xl bg-[#F1F5F9]" />
          <span className="sr-only">Loading…</span>
        </div>
      )}

      {comments.isError && listError && (
        <div
          role="alert"
          className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4"
        >
          <p className="text-sm font-medium text-[#EF4444]">
            {listError.kind === "gone"
              ? "This quiz is no longer available."
              : "Couldn't load comments."}
          </p>
          {listError.kind !== "gone" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-11"
              onClick={() => comments.refetch()}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {comments.data && comments.data.items.length === 0 && (
        <p
          data-testid="comment-empty"
          className="rounded-xl border border-dashed border-[#E2E8F0] p-4 text-sm text-[#64748B]"
        >
          No comments yet — start the discussion.
        </p>
      )}

      {comments.data && comments.data.items.length > 0 && (
        <ul className="space-y-3" aria-label="Comments">
          {comments.data.items.map((comment) => (
            <CommentListItem
              key={comment.commentId}
              comment={comment}
              publicationId={publicationId}
              authenticated={authenticated}
              myAliases={myAliases}
            />
          ))}
        </ul>
      )}

      {comments.data && comments.data.totalPages > 1 && (
        <nav
          aria-label="Comments pages"
          data-testid="comment-pagination"
          className="flex flex-wrap items-center gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            disabled={page === 0 || comments.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          {/* aria-live: page changes are announced without moving focus. */}
          <p aria-live="polite" className="text-sm font-medium text-[#64748B]">
            Page {page + 1} of {comments.data.totalPages}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            disabled={page >= comments.data.totalPages - 1 || comments.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
