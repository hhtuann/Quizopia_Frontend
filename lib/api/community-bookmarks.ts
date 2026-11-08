import { http } from "./http-client";
import type { PublicPublicationCard } from "./community";
import type { NormalizedApiError } from "./errors";

/**
 * Authenticated Community bookmark API (P3, issue #46 — ADR-006 §7 frozen
 * contract, backend #45).
 *
 * Routes (§7 auth matrix): `PUT`/`DELETE /api/community/publications/{id}/bookmark`
 * and `GET /api/community/me/bookmarks` — any ACTIVE user holding
 * `COMMUNITY_BOOKMARK` (STUDENT and TEACHER share ONE collection; dual-role
 * users see the same rows from either view). Guests get 401, so the FE never
 * calls these while unauthenticated — public surfaces render the login CTA.
 *
 * Failures reject as `NormalizedApiError` via the axios layer. This module
 * additionally reduces the statuses the bookmark UX MUST distinguish into
 * {@link BookmarkErrorKind} via {@link classifyBookmarkError}:
 * - 404 `gone` — the publication fails the §4 visibility predicate (hidden,
 *   unpublished, archived source, inactive publisher): already-unavailable.
 *   DELETE of an absent row is a 200 no-op, so a 404 always means "treat the
 *   publication as unavailable", never "row missing".
 * - 401 `unauthenticated` — session expired at AuthN after the single-flight
 *   refresh retry; the interceptor clears the session and the authed surface
 *   swaps to the login CTA.
 * - 429 `rateLimited` — §9 fixed-window limit; no state changed, retry later.
 */

/** Available entry: the §7 `PublicPublicationCard` allowlist + `savedAt`. */
export interface SavedPublicationCard extends PublicPublicationCard {
  /** `community_bookmarks.created_at`, ISO-8601. */
  savedAt: string;
  unavailable: false;
}

/**
 * Unavailable entry — `{publicationId, savedAt, unavailable: true}` ONLY
 * (§7: no title/alias/category/tags or ANY last-known content ships). The FE
 * renders the generic placeholder + Remove and consumes nothing else, even if
 * extra fields arrive at runtime (leak tests assert this).
 */
export interface UnavailableBookmark {
  publicationId: number;
  savedAt: string;
  unavailable: true;
}

/** Discriminated union of `GET /api/community/me/bookmarks` items. */
export type BookmarkEntry = SavedPublicationCard | UnavailableBookmark;

/** `PageResponse` envelope (0-based page/size, fixed `created_at DESC, id DESC`). */
export interface BookmarkPage {
  items: BookmarkEntry[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Bookmark list params — 0-based page, size clamped to [1, 50]. */
export interface BookmarkListParams {
  page?: number;
  size?: number;
}

/** Page size bounds (§7 `size` ≤ 50). */
export const MAX_BOOKMARK_PAGE_SIZE = 50;
/** Page size used by the saved-collection page. */
export const DEFAULT_BOOKMARK_PAGE_SIZE = 12;

/**
 * `GET /api/community/me/bookmarks?page&size` — the caller's collection,
 * newest first.
 */
export function listMyBookmarks(
  params: BookmarkListParams = {}
): Promise<BookmarkPage> {
  const size = Math.min(
    Math.max(1, params.size ?? DEFAULT_BOOKMARK_PAGE_SIZE),
    MAX_BOOKMARK_PAGE_SIZE
  );
  return http.get<BookmarkPage>("/api/community/me/bookmarks", {
    params: { page: Math.max(0, params.page ?? 0), size },
  });
}

/**
 * `PUT /api/community/publications/{id}/bookmark` — save. Idempotent: 201 on
 * first save, 200 on repeat (`ON CONFLICT DO NOTHING` + re-select). 404 when
 * the publication no longer passes the §4 predicate.
 */
export function putBookmark(publicationId: number): Promise<void> {
  return http.put<void>(
    `/api/community/publications/${publicationId}/bookmark`
  );
}

/**
 * `DELETE /api/community/publications/{id}/bookmark` — remove. Idempotent:
 * an absent row is a 200 no-op (this is how the collection page clears
 * unavailable placeholders, whose publications are already invisible).
 */
export function deleteBookmark(publicationId: number): Promise<void> {
  return http.delete<void>(
    `/api/community/publications/${publicationId}/bookmark`
  );
}

/** Failure classes the bookmark UX distinguishes (see module doc). */
export type BookmarkErrorKind =
  | "gone"
  | "unauthenticated"
  | "rateLimited"
  | "network"
  | "other";

/** Reduce any thrown value to a {@link BookmarkErrorKind}. Never throws. */
export function classifyBookmarkError(err: unknown): BookmarkErrorKind {
  const norm = err as NormalizedApiError | undefined;
  if (!norm) return "other";
  if (norm.kind === "network") return "network";
  if (norm.kind === "api") {
    if (norm.status === 404) return "gone";
    if (norm.status === 401) return "unauthenticated";
    if (norm.status === 429) return "rateLimited";
  }
  return "other";
}
