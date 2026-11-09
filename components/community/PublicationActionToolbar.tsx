"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  useDeleteLikeMutation,
  useDeleteRatingMutation,
  usePublicSocialSummaryQuery,
  usePutLikeMutation,
  useSocialSummaryQuery,
} from "@/hooks/queries/use-community-social";
import {
  usePublicationSavedQuery,
  useRemoveBookmarkMutation,
  useSaveBookmarkMutation,
} from "@/hooks/queries/use-community-bookmarks";
import { useAuth } from "@/hooks/useAuth";
import { ForkPublicationDialog } from "@/components/community/ForkPublicationDialog";
import { CommunityDialog } from "@/components/community/CommunityDialog";
import { describeBookmarkError } from "@/components/community/community-errors";
import { classifySocialError } from "@/lib/api/community-social";
import { Badge, Button, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Publication action toolbar (P3-C3, issue #67 — ADR-007 §7). Replaces the
 * two large Save/Fork panels with one compact, left-aligned, wrap-friendly
 * row ordered **Like → Comment → Rate → Fork → Save** — icon + label per
 * action, ≥44px (h-11) targets, active states (liked = filled heart +
 * accent; saved = filled bookmark; rated shows the star value) and
 * per-action loading disables. On narrow viewports the row wraps
 * (`flex-wrap` + gap) instead of overflowing horizontally.
 *
 * AUTH MATRIX (§7): guests render counts from the ANONYMOUS social-summary;
 * Like/Rate/Save (and Fork on forkable quizzes) become `/login` links
 * carrying the page-built `returnTo` continuation, while Comment stays a
 * button that anchor-scrolls to the `#discussion` section — comments remain
 * readable for guests. Authenticated users get the real toggles backed by
 * the idempotent §5 writes (explicit loading, no optimistic updates). Fork
 * keeps `allowFork` gating + the existing `ForkPublicationDialog` flow
 * (consent dialog, per-action Idempotency-Key — REUSED from
 * use-community-fork, not duplicated); STUDENT sees the non-actionable
 * "requires a teacher account" state. Save keeps the #46 bookmark semantics
 * (probe-derived state + idempotent PUT/DELETE — REUSED from
 * use-community-bookmarks, not duplicated).
 *
 * #68 SEAM — RATE: this issue ships the toolbar Rate control (renders the
 * average, opens this minimal ratings dialog with the aggregate + own
 * rating + Clear) and the full mutation set (`usePutRatingMutation` /
 * `useDeleteRatingMutation` in use-community-social). The accessible 1–5
 * star radiogroup selector that CALLS `usePutRatingMutation` is #68's
 * deliverable per the epic split; wiring it means replacing the
 * `RATE_DIALOG_SEAM` block below with the selector, everything else stays.
 */

/** §7 detail allowlist slice the toolbar actions need (nothing more). */
export interface PublicationActionTarget {
  publicationId: number;
  title: string;
  authorName: string;
  /** NO_FORK publications ship no fork control at all (§7 gating). */
  allowFork: boolean;
}

/**
 * §7 aggregate formatting — 2 decimals with trailing zeros trimmed
 * (`4.58 → "4.58"`, `4.6 → "4.6"`, `4 → "4"`), `—` when `null`
 * (zero ratings).
 */
export function formatAverage(average: number | null): string {
  if (average == null || !Number.isFinite(average)) return "—";
  const trimmed = average.toFixed(2).replace(/\.?0+$/, "");
  return trimmed === "" ? "0" : trimmed;
}

/** Humanize a `Retry-After` wait for the 429 copy. */
function waitHint(seconds: number | null): string {
  if (seconds == null) return "please wait a moment and try again";
  if (seconds < 60) {
    return `wait about ${seconds} second${seconds === 1 ? "" : "s"} and try again`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again`;
}

/**
 * Social-action copy. Distinct from the bookmark/fork copy because the
 * failure classes differ (adds the publisher self-rating 409).
 * Classification lives in `lib/api/community-social` (single source).
 */
export function describeSocialError(err: unknown): string {
  const { kind, retryAfterSeconds } = classifySocialError(err);
  switch (kind) {
    case "gone":
      return "This quiz is no longer available.";
    case "unauthenticated":
      return "Your session has expired — please sign in again.";
    case "selfRating":
      return "You can't rate your own quiz.";
    case "rateLimited":
      return `Too many requests — ${waitHint(retryAfterSeconds)}.`;
    case "network":
      return "Network error — check your connection and try again.";
    default:
      return "Couldn't update. Please try again.";
  }
}

/** Accent inline spinner — same ring geometry as the auth loader. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/** Icon-only presentation details shared by every toolbar control. */
function iconProps(filled = false) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    strokeWidth: filled ? 0 : 1.8,
    stroke: filled ? "none" : "currentColor",
    fill: filled ? "currentColor" : "none",
    className: "h-4 w-4 shrink-0",
    "aria-hidden": true,
  } as const;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...iconProps(filled)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg {...iconProps()}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...iconProps(filled)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg {...iconProps()}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
      />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...iconProps(filled)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 3.75V19.5l-6.75-3.375L3 19.5V3.75A1.125 1.125 0 0 1 4.125 2.625h10.5A1.125 1.125 0 0 1 16.5 3.75Z"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...iconProps()}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

/** Compact count/average chip beside a label — muted, never a tappable target. */
function CountChip({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold opacity-70">{children}</span>;
}

/** One toolbar notice line (role=status on success, role=alert on error). */
interface Notice {
  kind: "success" | "error";
  message: string;
}

export function PublicationActionToolbar({
  publication,
  loginHref,
}: {
  publication: PublicationActionTarget;
  loginHref: string;
}) {
  const { status, user } = useAuth();
  // §7 auth matrix: the auth-status-resolving first paint renders the guest
  // CTAs (same continuation posture as #46 — no wrong-state flash).
  const authenticated = status === "authenticated";
  // Only TEACHER-role callers may fork (dual-role users qualify).
  const isTeacher = (user?.roles ?? []).includes("TEACHER");
  const id = publication.publicationId;

  // Aggregates: anonymous twin for guests, authenticated twin (caller
  // states) for signed-in users. One is enabled at a time.
  const publicSummary = usePublicSocialSummaryQuery(id, !authenticated);
  const mySummary = useSocialSummaryQuery(id, authenticated);
  const summary = authenticated ? mySummary.data : publicSummary.data;
  const summaryPending = authenticated ? mySummary.isPending : publicSummary.isPending;

  // Like (§5 idempotent writes; explicit loading, no optimistic updates).
  const putLikeMut = usePutLikeMutation(id);
  const deleteLikeMut = useDeleteLikeMutation(id);
  const likeBusy = putLikeMut.isPending || deleteLikeMut.isPending;
  const liked = mySummary.data?.liked ?? false;

  // Save — REUSED #46 semantics: probe-derived state + idempotent PUT/DELETE.
  const { saved, isPending: savedPending } = usePublicationSavedQuery(
    id,
    authenticated
  );
  const saveMut = useSaveBookmarkMutation();
  const removeMut = useRemoveBookmarkMutation();
  const saveBusy = saveMut.isPending || removeMut.isPending;

  // Rate dialog (#68 seam — see module doc).
  const clearRatingMut = useDeleteRatingMutation(id);
  const myRating = mySummary.data?.myRating ?? null;
  const [rateOpen, setRateOpen] = useState(false);

  // Fork dialog session (REUSED #48 flow; stays mounted while open even if a
  // refetch flips `allowFork`, so a 403 explanation is never yanked away).
  const [forkOpen, setForkOpen] = useState(false);

  const [notice, setNotice] = useState<Notice | null>(null);

  /** Anchor-scroll to the #discussion section (readable for guests too). */
  const onComment = () => {
    document
      .getElementById("discussion")
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const onLike = async () => {
    setNotice(null);
    try {
      await (liked ? deleteLikeMut.mutateAsync() : putLikeMut.mutateAsync());
    } catch (err) {
      setNotice({ kind: "error", message: describeSocialError(err) });
    }
  };

  const onSave = async () => {
    setNotice(null);
    try {
      await saveMut.mutateAsync(id);
      setNotice({ kind: "success", message: "Saved to your collection." });
    } catch (err) {
      setNotice({ kind: "error", message: describeBookmarkError(err) });
    }
  };

  const onRemove = async () => {
    setNotice(null);
    try {
      await removeMut.mutateAsync(id);
      setNotice({ kind: "success", message: "Removed from your collection." });
    } catch (err) {
      setNotice({ kind: "error", message: describeBookmarkError(err) });
    }
  };

  const onClearRating = async () => {
    setNotice(null);
    try {
      await clearRatingMut.mutateAsync();
    } catch (err) {
      setNotice({ kind: "error", message: describeSocialError(err) });
    }
  };

  const likeCount = summary?.likeCount;
  const commentCount = summary?.commentCount;
  const averageText = summary ? formatAverage(summary.average) : null;
  // Like/Rate stay inert until the caller-state summary lands (no wrong
  // toggle direction); Save waits on its own #46 probe the same way.
  const statePending = authenticated && summaryPending;

  return (
    <div
      role="group"
      aria-label="Community actions"
      data-testid="publication-action-toolbar"
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      {/* 1 — LIKE */}
      {authenticated ? (
        <Button
          type="button"
          variant={liked ? "primary" : "outline"}
          className="h-11"
          aria-pressed={liked}
          aria-busy={likeBusy || statePending}
          disabled={likeBusy || statePending}
          onClick={onLike}
        >
          {likeBusy || statePending ? <Spinner /> : <HeartIcon filled={liked} />}
          {liked ? "Liked" : "Like"}{" "}
          {likeCount !== undefined && <CountChip>{likeCount}</CountChip>}
        </Button>
      ) : (
        <Link
          href={loginHref}
          data-testid="sign-in-to-like"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}
        >
          <HeartIcon filled={false} />
          Sign in to like{" "}
          {likeCount !== undefined && <CountChip>{likeCount}</CountChip>}
        </Link>
      )}

      {/* 2 — COMMENT (readable for guests: anchor-scroll, never a login detour) */}
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={onComment}
      >
        <CommentIcon />
        Comment{" "}
        {commentCount !== undefined && <CountChip>{commentCount}</CountChip>}
      </Button>

      {/* 3 — RATE */}
      {authenticated ? (
        <Button
          type="button"
          variant={myRating != null ? "primary" : "outline"}
          className="h-11"
          aria-label={
            summary
              ? `Ratings: ${formatAverage(summary.average)} of 5, ${summary.ratingCount} ratings${myRating != null ? `, your rating ${myRating}` : ""}`
              : "Ratings"
          }
          disabled={statePending}
          aria-busy={statePending}
          onClick={() => setRateOpen(true)}
        >
          {statePending ? <Spinner /> : <StarIcon filled={myRating != null} />}
          Rate
          {summary != null && (
            <CountChip>{myRating != null ? myRating : averageText}</CountChip>
          )}
        </Button>
      ) : (
        <Link
          href={loginHref}
          data-testid="sign-in-to-rate"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}
        >
          <StarIcon filled={false} />
          Sign in to rate{" "}
          {averageText != null && <CountChip>{averageText}</CountChip>}
        </Link>
      )}

      {/* 4 — FORK (§7 gating: NO_FORK ships no control at all) */}
      {publication.allowFork &&
        (authenticated ? (
          isTeacher ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setForkOpen(true)}
            >
              <ForkIcon />
              Fork
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled
              title="Only teacher accounts can fork quizzes into their own drafts."
            >
              <LockIcon />
              Fork
              <span className="sr-only">
                Only teacher accounts can fork quizzes
              </span>
            </Button>
          )
        ) : (
          <Link
            href={loginHref}
            data-testid="sign-in-to-fork"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}
          >
            <ForkIcon />
            Sign in to fork
          </Link>
        ))}

      {/* 5 — SAVE (REUSED #46 semantics + copy) */}
      {authenticated ? (
        <Button
          type="button"
          variant={saved ? "primary" : "outline"}
          className="h-11"
          aria-pressed={saved}
          aria-busy={saveBusy || savedPending}
          disabled={saveBusy || savedPending}
          onClick={saved ? onRemove : onSave}
        >
          {saveBusy || savedPending ? (
            <Spinner />
          ) : (
            <BookmarkIcon filled={saved} />
          )}
          {savedPending
            ? "Checking…"
            : saveMut.isPending
              ? "Saving…"
              : removeMut.isPending
                ? "Removing…"
                : saved
                  ? "Saved"
                  : "Save"}
        </Button>
      ) : (
        <Link
          href={loginHref}
          data-testid="sign-in-to-save"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}
        >
          <BookmarkIcon filled={false} />
          Sign in to save
        </Link>
      )}

      {notice && (
        <p
          role={notice.kind === "success" ? "status" : "alert"}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-sm font-medium",
            notice.kind === "success"
              ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#0F172A]"
              : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
          )}
        >
          {notice.message}
        </p>
      )}

      {/* RATE_DIALOG_SEAM (#68): minimal aggregate dialog — the accessible
          1–5 star radiogroup selector that sets a rating lands with the
          community discussion update; Clear (DELETE) is live today. */}
      <CommunityDialog
        open={rateOpen}
        titleId="rate-dialog-title"
        title="Ratings"
        description="How the community rates this quiz."
        onCancel={() => setRateOpen(false)}
        busy={clearRatingMut.isPending}
      >
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
            <StarIcon filled={summary != null && (summary.average ?? 0) > 0} />
            {summary
              ? `${formatAverage(summary.average)} / 5 · ${summary.ratingCount} ${summary.ratingCount === 1 ? "rating" : "ratings"}`
              : "Loading ratings…"}
          </p>
          {myRating != null ? (
            <div className="space-y-2">
              <Badge variant="accent">Your rating: {myRating}</Badge>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11"
                  disabled={clearRatingMut.isPending}
                  aria-busy={clearRatingMut.isPending}
                  onClick={onClearRating}
                >
                  {clearRatingMut.isPending ? <Spinner /> : null}
                  Clear my rating
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-[#64748B]">
              Star ratings open with the community discussion update (#68) —
              the average and count above are live.
            </p>
          )}
        </div>
      </CommunityDialog>

      {/* Mounted for the whole dialog session (see `forkOpen`) — the source
          data may refetch underneath it after a 403/404 (#48). */}
      {forkOpen && (
        <ForkPublicationDialog
          open
          publication={{
            publicationId: publication.publicationId,
            title: publication.title,
            authorName: publication.authorName,
          }}
          onClose={() => setForkOpen(false)}
        />
      )}
    </div>
  );
}
