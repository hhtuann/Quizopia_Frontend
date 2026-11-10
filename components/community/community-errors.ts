import type { NormalizedApiError } from "@/lib/api";
import { classifyCommentError } from "@/lib/api/community-comments";
import { classifyBookmarkError } from "@/lib/api/community-bookmarks";

/**
 * Map §4/§7 Community error codes to actionable copy. Shared by the publish
 * dialog, the owner list and the moderation console — one place per ADR code.
 *
 * Caller-matrix mapping (§7 auth matrix → FE surface):
 * - STUDENT on owner/moderation routes → 403 `COMMUNITY_ACCESS_DENIED` —
 *   unreachable through the UI (route groups / grant gate), so the generic
 *   permission line below is the defense-in-depth surface.
 * - foreign publication id → 404 anti-enumeration (never 403): callers get
 *   `notFound` and their list query is invalidated (fresh rows, no stale ids).
 * - disabled/LOCKED/PENDING/unverified → 401 at AuthN: the axios layer
 *   clears the session and RequireAuth sends the user to /login; the FE
 *   never renders a "disabled" branch itself.
 * - moderator on owner routes / owner on moderation routes → 403 as above.
 */

export interface CommunityActionError {
  /** Server state moved — the caller's queries were invalidated; refetch before retry. */
  conflict?: boolean;
  /** 404 anti-enumeration (absent/foreign row) — same handling as conflict. */
  notFound?: boolean;
  message: string;
}

export function describeCommunityError(err: unknown): CommunityActionError {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    if (norm.status === 404) {
      return {
        notFound: true,
        message:
          "This publication no longer exists (or isn't yours). Your list was refreshed.",
      };
    }
    switch (norm.code) {
      case "COMMUNITY_PUBLICATION_EXISTS":
        return {
          message:
            "This exam already has a community publication — manage it from “My community publications”.",
        };
      case "COMMUNITY_CONCURRENT_MODIFICATION":
        return {
          conflict: true,
          message:
            "This publication changed elsewhere. Refreshed to the latest — review and retry.",
        };
      case "COMMUNITY_ALIAS_REQUIRED":
        return {
          message:
            "A public credit alias is required before publishing — add one under “Edit details”.",
        };
      case "COMMUNITY_MODERATION_HIDDEN":
        return {
          message:
            "A community moderator has hidden this publication. Publishing stays blocked until a moderator restores it.",
        };
      case "COMMUNITY_PUBLISH_INELIGIBLE":
        return {
          conflict: true,
          message:
            "This exam is no longer eligible for community publishing (for example, it was archived).",
        };
      case "COMMUNITY_ACCESS_DENIED":
        return { message: "You don't have permission for this action." };
      default:
        if (norm.status === 429) {
          return {
            message: "Too many requests — please wait a moment and try again.",
          };
        }
        return { message: norm.message || "Action failed. Please try again." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}

/**
 * Bookmark-specific copy (#46, ADR-006 §7). Distinct from
 * {@link describeCommunityError} because the failure classes differ: a 404
 * here means the PUBLICATION no longer passes the §4 visibility predicate
 * (never a foreign-owner resource), 401 means the session expired mid-action
 * (the axios refresh layer already retried once), and 429 is the §9 window.
 * Classification lives in `lib/api/community-bookmarks` (single source).
 */
export function describeBookmarkError(err: unknown): string {
  const kind = classifyBookmarkError(err);
  switch (kind) {
    case "gone":
      return "This quiz is no longer available.";
    case "unauthenticated":
      return "Your session has expired — please sign in again.";
    case "rateLimited":
      return "Too many requests — please wait a moment and try again.";
    case "network":
      return "Network error — check your connection and try again.";
    default:
      return "Couldn't update your saved quizzes. Please try again.";
  }
}

/** Which §5 row a comment-action 404 landed on — selects the gone copy. */
export type CommentErrorScope = "publication" | "comment";

/**
 * Comment-action copy (#73 — ADR-007 Rev 4). Distinct from the
 * bookmark/fork/social copy because the failure classes differ: 409
 * `COMMUNITY_COMMENT_STATE_INVALID` is an edit against a comment that
 * is no longer VISIBLE, 400 `COMMUNITY_VALIDATION_ERROR` is a body-
 * bounds rejection, and 404 means the publication/comment is gone.
 * Classification lives in `lib/api/community-comments` (single source).
 *
 * The 404 line is SCOPE-SPLIT: the create POST addresses the PUBLICATION
 * (quiz gone), while the PATCH/DELETE/report routes address the COMMENT row
 * itself (comment gone) — `scope` picks the copy.
 */
export function describeCommentError(
  err: unknown,
  scope: CommentErrorScope = "publication"
): string {
  const { kind, retryAfterSeconds } = classifyCommentError(err);
  switch (kind) {
    case "gone":
      return scope === "comment"
        ? "This comment is no longer available."
        : "This quiz is no longer available.";
    case "stateInvalid":
      return "This comment can no longer be edited.";
    case "validation":
      return "Comments must be 2000 characters or fewer.";
    case "unauthenticated":
      return "Your session has expired — please sign in again.";
    case "rateLimited":
      return `Too many requests — ${waitHint(retryAfterSeconds)}.`;
    case "network":
      return "Network error — check your connection and try again.";
    default:
      return "Couldn't update the discussion. Please try again.";
  }
}

/**
 * Humanize a `Retry-After` wait for the 429 copy (#67 `waitHint`) — the
 * single shared helper every community action surface consumes (toolbar,
 * star selector, comment editor).
 */
export function waitHint(seconds: number | null): string {
  if (seconds == null) return "please wait a moment and try again";
  if (seconds < 60) {
    return `wait about ${seconds} second${seconds === 1 ? "" : "s"} and try again`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again`;
}

