"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getPublicPublication,
  listPublicCategories,
  listPublicPublications,
  listPublicTags,
  type PublicPublicationListParams,
} from "@/lib/api/community";

/**
 * Public Community queries (P3, issue #43). All four hit anonymous
 * `/api/public/community/**` routes — no auth token required (the shared
 * client attaches one if present; the backend ignores it on public routes).
 *
 * `staleTime` defaults to the provider's 30s; taxonomy/tags opt into longer
 * windows below. Errors arrive as `NormalizedApiError` via the axios layer.
 */

/**
 * Public catalog query — filter-scoped key + `keepPreviousData` (no flicker on
 * search/category/tag/page change). Mirrors `useExamsQuery`.
 */
export function useCommunityPublicationsQuery(
  params: PublicPublicationListParams
) {
  return useQuery({
    queryKey: ["community", "publications", params],
    queryFn: () => listPublicPublications(params),
    placeholderData: keepPreviousData,
  });
}

/** Public detail query. `enabled` guards against an invalid URL id. */
export function useCommunityPublicationQuery(
  publicationId: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["community", "publications", publicationId, "detail"],
    queryFn: () => getPublicPublication(publicationId),
    enabled,
  });
}

/** Category dropdown query — migration-managed rows, never change at runtime. */
export function useCommunityCategoriesQuery() {
  return useQuery({
    queryKey: ["community", "categories"],
    queryFn: () => listPublicCategories(),
    staleTime: 5 * 60_000,
  });
}

/** Tag chip query — usage counts drift with publishes/hides, so 60s only. */
export function useCommunityTagsQuery() {
  return useQuery({
    queryKey: ["community", "tags"],
    queryFn: () => listPublicTags(),
    staleTime: 60_000,
  });
}
