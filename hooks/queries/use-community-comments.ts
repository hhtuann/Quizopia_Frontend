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
 * Comment queries + mutations (P3-C4, issue #68 — ADR-007 §5/§7).
 *
 * KEY DESIGN — list prefix: the anonymous page lives under
 * flickers). Every comment write invalidates that publication's whole
 * `["community","comments",id]` prefix AND the `["community","social",id]`
 * prefix (creates/deletes move the summary `commentCount` — §3 keeps the two
 * counts on the same VISIBLE predicate, so one settle keeps them honest).
 *
 * ALIAS KNOWLEDGE: the §5 comment DTO carries no ownership flag (an author
 * is public only as `authorAlias`), so the FE tracks the caller's own
 * aliases in a cache-only SET under `["community","comments","my-alias"]`.
 * Every successful create APPENDS the response's stored alias snapshot (the
 * post-upsert value, §4; most recent last, no duplicates), so an in-session
 * alias change never hides rows authored under the previous name. The entry
 * is a SIBLING of the per-publication list keys, so list invalidation never
 * disturbs it. See `CommentSection`/`CommentListItem` for the ownership
 * heuristic built on it.
 *
 * Mutations are EXPLICIT-LOADING (no optimistic updates); a 404 "gone"
 * additionally invalidates the whole `["community"]` tree so the detail page
 * refetches into its neutral not-available state — the #46/#48/#67 posture.
 */

/** §5 default list size (1..50; the backend clamps to the same range). */
export { DEFAULT_COMMENT_PAGE_SIZE };

/**
 * Cache-only key holding the SET of aliases the caller has stored this
 * session (see module doc) — most recent LAST, no duplicates.
 */
export const MY_COMMENT_ALIAS_KEY = ["community", "comments", "my-alias"] as const;

/**
 * Every alias the caller has stored THIS session — append-only, most recent
 * last (the LAST entry is the current alias), `[]` before the first create.
 * Cache-only: never fetches (a forced refetch round-trips the cached
 * value), so invalidations can never clobber it.
 */
export function useMyCommentAliasesQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: MY_COMMENT_ALIAS_KEY,
    queryFn: () =>
      queryClient.getQueryData<readonly string[]>(MY_COMMENT_ALIAS_KEY) ?? [],
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

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
 * Create a comment (§5 POST). On success the response's stored `authorAlias`
 * is APPENDED to the caller's known alias set; on 409 `COMMUNITY_ALIAS_TAKEN`
 * the editor surfaces the retry-with-another-name copy (nothing is
 * invalidated — the server aborted atomically, §4).
 */
export function useCreateCommentMutation(publicationId: number) {
  const queryClient = useQueryClient();
  const { invalidateComments, invalidateSocial, invalidateCommunity } =
    useCommentInvalidation(publicationId);
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      createComment(publicationId, input),
    onSuccess: (created) => {
      // Append the stored snapshot to the session's alias SET (dedup, most
      // recent last): an alias change keeps older own rows recognised, and
      // the last entry stays the caller's current alias.
      const known = (
        queryClient.getQueryData<readonly string[]>(MY_COMMENT_ALIAS_KEY) ?? []
      ).filter((alias) => alias !== created.authorAlias);
      queryClient.setQueryData(MY_COMMENT_ALIAS_KEY, [
        ...known,
        created.authorAlias,
      ]);
    },
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
