"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifySocialError,
  deleteLike,
  deleteRating,
  getPublicSocialSummary,
  getSocialSummary,
  putLike,
  putRating,
} from "@/lib/api/community-social";

/**
 * Social-summary queries + like/rating mutations (P3-C3, issue #67 —
 * ADR-007 §5/§7).
 *
 * KEY DESIGN — two summaries, one prefix: the anonymous twin lives under
 * `["community","social",id,"public"]` (guests + any guest-visible aggregate
 * surface), the authenticated twin under `["community","social",id]`. Both
 * are served by the SAME backend aggregates, so every write invalidates the
 * `["community","social",id]` PREFIX after settle — one call refetches both
 * the caller-state twin and the public one, on this surface and any other
 * tab holding the same keys.
 *
 * Mutations are EXPLICIT-LOADING (no optimistic updates): the button
 * disables + spins until the idempotent write settles, then the summary
 * refetch renders the server-truthful counts/states. A 404 "gone" (the
 * publication failed the §4 predicate mid-action) additionally invalidates
 * the whole `["community"]` tree so the detail page refetches into its
 * neutral not-available state — the #46/#48 posture.
 */

/**
 * Anonymous social-summary — enabled for guests (and any guest-visible
 * aggregate surface); authenticated callers switch to the twin below.
 */
export function usePublicSocialSummaryQuery(
  publicationId: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["community", "social", publicationId, "public"],
    queryFn: () => getPublicSocialSummary(publicationId),
    enabled,
  });
}

/**
 * Authenticated social-summary — aggregates plus the caller's own
 * `liked`/`myRating`.
 */
export function useSocialSummaryQuery(
  publicationId: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["community", "social", publicationId],
    queryFn: () => getSocialSummary(publicationId),
    enabled,
  });
}

function useSocialInvalidation(publicationId: number) {
  const queryClient = useQueryClient();
  return {
    /** Like/rating writes only move social rows — precise prefix scope. */
    invalidateSocial: () =>
      queryClient.invalidateQueries({
        queryKey: ["community", "social", publicationId],
      }),
    /** "Gone" publications also invalidate the detail/catalog tree. */
    invalidateCommunity: () =>
      queryClient.invalidateQueries({ queryKey: ["community"] }),
  };
}

/** Like (PUT) — idempotent 200/201; invalidates the social prefix after settle. */
export function usePutLikeMutation(publicationId: number) {
  const { invalidateSocial, invalidateCommunity } =
    useSocialInvalidation(publicationId);
  return useMutation({
    mutationFn: () => putLike(publicationId),
    onSettled: invalidateSocial,
    onError: (error) => {
      if (classifySocialError(error).kind === "gone") invalidateCommunity();
    },
  });
}

/** Unlike (DELETE) — idempotent; invalidates the social prefix after settle. */
export function useDeleteLikeMutation(publicationId: number) {
  const { invalidateSocial, invalidateCommunity } =
    useSocialInvalidation(publicationId);
  return useMutation({
    mutationFn: () => deleteLike(publicationId),
    onSettled: invalidateSocial,
    onError: (error) => {
      if (classifySocialError(error).kind === "gone") invalidateCommunity();
    },
  });
}

/**
 * Rate (PUT `{rating: 1..5}`) — idempotent upsert; invalidates the social
 * prefix after settle. The value passes through verbatim (#68's star
 * selector is the only caller).
 */
export function usePutRatingMutation(publicationId: number) {
  const { invalidateSocial, invalidateCommunity } =
    useSocialInvalidation(publicationId);
  return useMutation({
    mutationFn: (rating: number) => putRating(publicationId, rating),
    onSettled: invalidateSocial,
    onError: (error) => {
      if (classifySocialError(error).kind === "gone") invalidateCommunity();
    },
  });
}

/** Clear rating (DELETE) — idempotent; invalidates the social prefix after settle. */
export function useDeleteRatingMutation(publicationId: number) {
  const { invalidateSocial, invalidateCommunity } =
    useSocialInvalidation(publicationId);
  return useMutation({
    mutationFn: () => deleteRating(publicationId),
    onSettled: invalidateSocial,
    onError: (error) => {
      if (classifySocialError(error).kind === "gone") invalidateCommunity();
    },
  });
}
