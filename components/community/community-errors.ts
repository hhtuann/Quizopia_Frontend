import type { NormalizedApiError } from "@/lib/api";

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
