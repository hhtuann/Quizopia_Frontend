"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCommunityPublication,
  dismissReport,
  getModerationGrant,
  getPublicationHistory,
  hidePublication,
  listModerationReports,
  listMyPublications,
  publishCommunityPublication,
  resolveReport,
  restorePublication,
  unpublishCommunityPublication,
  updateCommunityPublication,
  type CreateCommunityPublicationRequest,
  type ModerationReportListParams,
  type OwnerPublicationListParams,
  type UpdateCommunityPublicationRequest,
} from "@/lib/api/community-owner";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Owner + moderation Community queries (P3, issue #44 — ADR-006 §7).
 *
 * Invalidation policy: every successful owner/moderation write invalidates the
 * whole `["community"]` tree — the owner list (`openReportCount`,
 * `moderationState`, `version`), the public catalog/tags (#43's keys nest
 * under `["community"]` too) and the moderation queue/history. 409/404
 * outcomes that mean "server state moved" also invalidate so the owner list
 * refetches a fresh `version` (the optimistic token) before any retry — the
 * `useUpdateCompositionMutation` conflict pattern.
 */

/** True when the normalized error means "refetch before the user retries". */
function isConflict(norm: NormalizedApiError | undefined): boolean {
  if (norm?.kind !== "api") return false;
  if (norm.status === 404) return true;
  return norm.code === "COMMUNITY_CONCURRENT_MODIFICATION";
}

/**
 * Owner list — own publications as a paged envelope, `created_at DESC, id DESC`
 * (§3 index). Filter-scoped key + `keepPreviousData` so page flips don't
 * flicker (same pattern as `useMyBookmarksQuery`/`useModerationReportsQuery`).
 */
export function useMyPublicationsQuery(params: OwnerPublicationListParams) {
  return useQuery({
    queryKey: ["community", "mine", params],
    queryFn: () => listMyPublications(params),
    placeholderData: keepPreviousData,
  });
}

/** Create the (UNPUBLISHED) publication — the dialog follows up with publish. */
export function useCreateCommunityPublicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateCommunityPublicationRequest) =>
      createCommunityPublication(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
    },
  });
}

/**
 * PATCH metadata (`expectedVersion` optimistic token). On 409
 * `COMMUNITY_CONCURRENT_MODIFICATION` the owner list is invalidated so the
 * fresh `version` lands before the caller retries.
 */
export function useUpdateCommunityPublicationMutation(publicationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateCommunityPublicationRequest) =>
      updateCommunityPublication(publicationId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
    },
    onError: (error) => {
      if (isConflict(error as unknown as NormalizedApiError)) {
        queryClient.invalidateQueries({ queryKey: ["community"] });
      }
    },
  });
}
/**
 * Publish — 200 idempotent no-op when already PUBLISHED + VISIBLE (§4).
 * 409s worth refetching: `COMMUNITY_CONCURRENT_MODIFICATION`,
 * `COMMUNITY_PUBLISH_INELIGIBLE` (exam archived), 404 (foreign/deleted).
 * The publication id rides on the mutation call so one hook serves the
 * publish dialog and every row on the owner list.
 */
export function usePublishCommunityPublicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (publicationId: number) => publishCommunityPublication(publicationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
    },
    onError: (error) => {
      const norm = error as unknown as NormalizedApiError;
      if (
        isConflict(norm) ||
        (norm?.kind === "api" && norm.code === "COMMUNITY_PUBLISH_INELIGIBLE")
      ) {
        queryClient.invalidateQueries({ queryKey: ["community"] });
      }
    },
  });
}

/** Unpublish — idempotent no-op when already UNPUBLISHED (§4). */
export function useUnpublishCommunityPublicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (publicationId: number) => unpublishCommunityPublication(publicationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
    },
    onError: (error) => {
      if (isConflict(error as unknown as NormalizedApiError)) {
        queryClient.invalidateQueries({ queryKey: ["community"] });
      }
    },
  });
}


/**
 * `GET /api/community/moderation/grant` — the console gate. 200
 * `{granted:true}` with the dormant moderator role, 403 without (the FE
 * renders the "not a moderator" state; 403 is never retried — provider
 * default). The hooks below assume the caller already rendered behind this
 * gate; the backend re-checks COMMUNITY_MODERATION on every route anyway.
 */
export function useModerationGrantQuery() {
  return useQuery({
    queryKey: ["community", "moderation", "grant"],
    queryFn: () => getModerationGrant(),
    staleTime: 5 * 60_000,
  });
}
/** Report queue — filter-scoped key, `keepPreviousData`, `enabled` = granted. */
export function useModerationReportsQuery(
  params: ModerationReportListParams,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["community", "moderation", "reports", params],
    queryFn: () => listModerationReports(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

function useModerationWriteInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["community"] });
}

/** Moderator hide — VISIBLE→HIDDEN, mandatory reason, idempotent no-op (§4). */
export function useHidePublicationMutation() {
  const invalidate = useModerationWriteInvalidation();
  return useMutation({
    mutationFn: ({ publicationId, reason }: { publicationId: number; reason: string }) =>
      hidePublication(publicationId, reason),
    onSuccess: invalidate,
  });
}

/** Moderator restore — HIDDEN→VISIBLE, does not change publish status (§4). */
export function useRestorePublicationMutation() {
  const invalidate = useModerationWriteInvalidation();
  return useMutation({
    mutationFn: ({ publicationId, reason }: { publicationId: number; reason: string }) =>
      restorePublication(publicationId, reason),
    onSuccess: invalidate,
  });
}

/** Dismiss a report — optional note (§7). */
export function useDismissReportMutation() {
  const invalidate = useModerationWriteInvalidation();
  return useMutation({
    mutationFn: ({ reportId, note }: { reportId: number; note?: string }) =>
      dismissReport(reportId, note),
    onSuccess: invalidate,
  });
}

/** Resolve a report — optional note (§7). */
export function useResolveReportMutation() {
  const invalidate = useModerationWriteInvalidation();
  return useMutation({
    mutationFn: ({ reportId, note }: { reportId: number; note?: string }) =>
      resolveReport(reportId, note),
    onSuccess: invalidate,
  });
}

/** Per-publication audit history — fetched while the history dialog is open. */
export function usePublicationHistoryQuery(publicationId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["community", "moderation", "history", publicationId],
    queryFn: () => getPublicationHistory(publicationId),
    enabled,
  });
}
