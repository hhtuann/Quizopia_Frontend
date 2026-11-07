"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyBookmarkError,
  deleteBookmark,
  listMyBookmarks,
  MAX_BOOKMARK_PAGE_SIZE,
  putBookmark,
  type BookmarkListParams,
} from "@/lib/api/community-bookmarks";

/**
 * Bookmark queries (P3, issue #46 — ADR-006 §7).
 *
 * KEY DESIGN — deliberately boring, ONE key family (the frozen contract has
 * no per-publication status endpoint): everything lives under
 * `["community", "bookmarks", "mine", params]`.
 * - The collection page queries its own `{page, size}` slice.
 * - The public detail page's save-state check reuses the SAME family with the
 *   fixed {@link BOOKMARK_SET_PARAMS} probe ("lightweight set"): membership =
 *   any entry carrying the publication id. Both surfaces share one cache, so
 *   a mutation's invalidation refreshes the collection AND the detail toggle
 *   in one shot (cross-page/cross-tab consistency follows from the shared
 *   client + stale-marked refetch on next focus/remount).
 *   Trade-off: a collection longer than one max-size page (50) may show
 *   "Save" for an older bookmark — clicking is an idempotent 200 no-op that
 *   restores the truthful state, so the failure mode is benign.
 *
 * MUTATIONS — explicit loading only, NO optimistic updates (#46): buttons
 * spin and disable while in flight (double-click safe; the backend is
 * idempotent anyway) and invalidate after settle. A 404 additionally
 * invalidates the whole `["community"]` tree so the public detail refetches
 * and flips to the neutral not-available state (§4 anti-enumeration).
 */

/** The caller's saved-collection page (`keepPreviousData` — no flicker on paging). */
export function useMyBookmarksQuery(
  params: BookmarkListParams,
  enabled = true
) {
  return useQuery({
    queryKey: ["community", "bookmarks", "mine", params],
    queryFn: () => listMyBookmarks(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Fixed one-page probe the public detail page derives its save-state from
 * (see KEY DESIGN above). Newest-first covers the overwhelmingly common
 * "recently saved" case; older misses self-heal via the idempotent PUT.
 */
export const BOOKMARK_SET_PARAMS: BookmarkListParams = {
  page: 0,
  size: MAX_BOOKMARK_PAGE_SIZE,
};

/**
 * Save-state for one publication on the public detail page — derived from the
 * probe query, NOT a second key family. `isPending` gates the toggle so it
 * never flashes a wrong label; on probe error the caller treats the state as
 * unknown-but-clickable (the PUT is idempotent, the server stays truthful).
 */
export function usePublicationSavedQuery(
  publicationId: number,
  enabled: boolean
) {
  const query = useMyBookmarksQuery(BOOKMARK_SET_PARAMS, enabled);
  const saved = (query.data?.items ?? []).some(
    (entry) => entry.publicationId === publicationId
  );
  return { saved, isPending: query.isPending, isError: query.isError };
}

function useBookmarkInvalidation() {
  const queryClient = useQueryClient();
  return {
    /** Bookmark writes only move bookmark rows — precise scope. */
    invalidateBookmarks: () =>
      queryClient.invalidateQueries({ queryKey: ["community", "bookmarks"] }),
    /** "Gone" publications also invalidate the detail/catalog tree. */
    invalidateCommunity: () =>
      queryClient.invalidateQueries({ queryKey: ["community"] }),
  };
}

/** Save (PUT) — idempotent 200/201; invalidates the bookmark keys after settle. */
export function useSaveBookmarkMutation() {
  const { invalidateBookmarks, invalidateCommunity } = useBookmarkInvalidation();
  return useMutation({
    mutationFn: (publicationId: number) => putBookmark(publicationId),
    onSuccess: invalidateBookmarks,
    onError: (error) => {
      if (classifyBookmarkError(error) === "gone") invalidateCommunity();
    },
  });
}

/** Remove (DELETE) — idempotent; invalidates the bookmark keys after settle. */
export function useRemoveBookmarkMutation() {
  const { invalidateBookmarks, invalidateCommunity } = useBookmarkInvalidation();
  return useMutation({
    mutationFn: (publicationId: number) => deleteBookmark(publicationId),
    onSuccess: invalidateBookmarks,
    onError: (error) => {
      if (classifyBookmarkError(error) === "gone") invalidateCommunity();
    },
  });
}
