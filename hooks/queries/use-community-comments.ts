"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  classifyCommentError,
  createComment,
  DEFAULT_COMMENT_PAGE_SIZE,
  deleteComment,
  listComments,
  reportComment,
  updateComment,
  type CommentListParams,
  type CommentReportInput,
  type CreateCommentInput,
} from "@/lib/api/community-comments";

/**
 * Comment queries + mutations (P3-C4, issue #68 — ADR-007 §5/§7; Rev 4 / #72).
 *
 * KEY DESIGN — list prefix: the anonymous page lives under
 * `["community","comments",id]` with `keepPreviousData` (page changes never
 * flickers). Every comment write invalidates that publication's whole
 * `["community","comments",id]` prefix AND the `["community","social",id]`
 * prefix (creates/deletes move the summary `commentCount` — §3 keeps the two
 * counts on the same VISIBLE predicate, so one settle keeps them honest).
 *
 * OWNERSHIP (Rev 4 / #72): each list item carries the server-computed
 * `isMine` flag (true only for the authenticated author of that row;
 * `false` when anonymous) — the former cache-only session alias set is
 * deleted: name text never decided ownership (duplicate displayNames are
 * legal) and the flag survives reloads, renames and cross-device sessions.
 *
 * Mutations are EXPLICIT-LOADING (no optimistic updates); a 404 "gone"
 * additionally invalidates the whole `["community"]` tree so the detail page
 * refetches into its neutral not-available state — the #46/#48/#67 posture.
 */

/** §5 default list size (1..50; the backend clamps to the same range). */
export { DEFAULT_COMMENT_PAGE_SIZE };


/** Newest-first public comment page for one publication (anonymous route). */
export function useCommunityCommentsQuery(
  publicationId: number,
  params: CommentListParams,
  enabled = true
) {
  return useQuery({
    queryKey: ["community", "comments", publicationId, params],
    queryFn: () => listComments(publicationId, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

function useCommentInvalidation(publicationId: number) {
  const queryClient = useQueryClient();
  return {
    /** Creates/deletes move list rows and the summary `commentCount`. */
    invalidateComments: () =>
      queryClient.invalidateQueries({
        queryKey: ["community", "comments", publicationId],
      }),
    /** The §3 summary counts share the VISIBLE-only predicate with the list. */
    invalidateSocial: () =>
      queryClient.invalidateQueries({
        queryKey: ["community", "social", publicationId],
      }),
    /** "Gone" publications also invalidate the detail/catalog tree. */
    invalidateCommunity: () =>
      queryClient.invalidateQueries({ queryKey: ["community"] }),
  };
}

/**
 * Create a comment (§5 POST — `{body}` only; the author identity/name are
 * derived server-side from the session). Settling invalidates the list +
 * summary; a 404 "gone" additionally invalidates the community tree.
 */
export function useCreateCommentMutation(publicationId: number) {
  const { invalidateComments, invalidateSocial, invalidateCommunity } =
    useCommentInvalidation(publicationId);
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      createComment(publicationId, input),
    onSettled: () => {
      invalidateComments();
      invalidateSocial();
    },
    onError: (error) => {
      if (classifyCommentError(error).kind === "gone") invalidateCommunity();
    },
  });
}

/** Edit an own comment (§5 owner PATCH — body only, sets `edited_at`). */
export function useUpdateCommentMutation(publicationId: number) {
  const { invalidateComments, invalidateSocial, invalidateCommunity } =
    useCommentInvalidation(publicationId);
  return useMutation({
    mutationFn: (vars: { commentId: number; body: string }) =>
      updateComment(vars.commentId, { body: vars.body }),
    onSettled: () => {
      invalidateComments();
      invalidateSocial();
    },
    onError: (error) => {
      if (classifyCommentError(error).kind === "gone") invalidateCommunity();
    },
  });
}

/** Delete an own comment (§5 owner DELETE — idempotent soft delete). */
export function useDeleteCommentMutation(publicationId: number) {
  const { invalidateComments, invalidateSocial, invalidateCommunity } =
    useCommentInvalidation(publicationId);
  return useMutation({
    mutationFn: (commentId: number) => deleteComment(commentId),
    onSettled: () => {
      invalidateComments();
      invalidateSocial();
    },
    onError: (error) => {
      if (classifyCommentError(error).kind === "gone") invalidateCommunity();
    },
  });
}

/** Vars accepted by {@link useReportCommentMutation}. */
export interface ReportCommentVars {
  commentId: number;
  reasonCode: CommentReportInput["reasonCode"];
  details?: string;
}

/**
 * {@link useReportCommentMutation} handle. Owned here (and named) so the
 * report dialog can accept it as a prop — its success state must outlive the
 * dialog unmounting.
 */
export type ReportCommentMutation = UseMutationResult<
  void,
  Error,
  ReportCommentVars
>;

/**
 * Report a comment (§5 POST …/reports — 201 first, 200 idempotent dedupe).
 * Reports never move public rows; the list is still invalidated so a retried
 * report re-reads server truth.
 */
export function useReportCommentMutation(publicationId: number) {
  const { invalidateComments, invalidateCommunity } =
    useCommentInvalidation(publicationId);
  return useMutation({
    mutationFn: (vars: ReportCommentVars) =>
      reportComment(vars.commentId, {
        reasonCode: vars.reasonCode,
        details: vars.details,
      }),
    onSettled: invalidateComments,
    onError: (error) => {
      if (classifyCommentError(error).kind === "gone") invalidateCommunity();
    },
  });
}
