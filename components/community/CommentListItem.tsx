"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { describeCommentError } from "./community-errors";
import { CommentBodyTextarea } from "./CommentEditor";
import { CommentReportDialog } from "./CommentReportDialog";
import {
  useDeleteCommentMutation,
  useReportCommentMutation,
  useUpdateCommentMutation,
} from "@/hooks/queries/use-community-comments";
import type { CommunityComment } from "@/lib/api/community-comments";
import { communityCommentBodySchema } from "@/lib/validation/community-schemas";

/**
 * One discussion row (P3-C4, issue #68 — ADR-007 §7): alias, timestamp,
 * edited marker, plain-text body (React escaping only — never HTML), and the
 * ownership-split actions.
 *
 * OWNERSHIP HEURISTIC (the full contract also lives in `CommentEditor` and
 * the use-community-comments module doc): the §5 DTO carries no ownership
 * flag, so "own" means `comment.authorAlias` EXACTLY-MATCHES a member of
 * this session's known aliases — the cache-only SET each successful create
 * appends its stored alias snapshot to. Failure modes, deliberate and
 * server-guarded:
 * - Aliases stored only in EARLIER sessions start unknown, so an alias
 *   changed since then hides older own comments (Report renders instead of
 *   Edit/Delete) until the next create re-captures the stored alias.
 * - Alias recycling (the released ci-unique name later taken over by
 *   someone else) can show owner actions on a foreign comment — the server
 *   remains the truth and the owner-scoped PATCH/DELETE then 404s, surfaced
 *   as the comment-scoped "no longer available" copy.
 */

/** `createdAt` display form — same en-GB short-date shape as the detail page. */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CommentListItem({
  comment,
  publicationId,
  authenticated,
  myAliases,
}: {
  comment: CommunityComment;
  publicationId: number;
  authenticated: boolean;
  /** Aliases the caller has stored this session (cache-only set; empty until the first create). */
  myAliases: readonly string[];
}) {
  const mine = authenticated && myAliases.includes(comment.authorAlias);

  const updateMut = useUpdateCommentMutation(publicationId);
  const deleteMut = useDeleteCommentMutation(publicationId);
  const reportMut = useReportCommentMutation(publicationId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [reportOpen, setReportOpen] = useState(false);

  const draftOk = communityCommentBodySchema.safeParse(draft).success;

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftOk || updateMut.isPending) return;
    // Settled edit (mutate callback — event-time, not an effect): leave
    // inline-edit mode; the §5 PATCH feeds the invalidation that refetches.
    updateMut.mutate(
      { commentId: comment.commentId, body: draft },
      { onSuccess: () => setEditing(false) }
    );
  };

  // Edit opens the inline editor pre-filled with the current body.
  const startEdit = () => {
    setDraft(comment.body);
    setEditing(true);
  };

  return (
    <li
      data-testid={`comment-${comment.commentId}`}
      className="rounded-xl border border-[#E2E8F0] p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-[#0F172A]">
          {comment.authorAlias}
        </span>
        <time
          dateTime={comment.createdAt}
          className="text-xs font-medium text-[#64748B]"
        >
          {formatTimestamp(comment.createdAt)}
        </time>
        {comment.editedAt != null && (
          <span className="text-xs italic text-[#64748B]">(edited)</span>
        )}
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="mt-2 space-y-2" aria-label="Edit comment">
          <CommentBodyTextarea
            id={`edit-body-${comment.commentId}`}
            value={draft}
            onChange={setDraft}
            disabled={updateMut.isPending}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              className="h-11"
              disabled={!draftOk || updateMut.isPending}
              aria-busy={updateMut.isPending}
            >
              {updateMut.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11"
              onClick={() => setEditing(false)}
              disabled={updateMut.isPending}
            >
              Cancel
            </Button>
          </div>
          {updateMut.error && (
            <p role="alert" className="text-sm font-medium text-[#EF4444]">
              {describeCommentError(updateMut.error, "comment")}
            </p>
          )}
        </form>
      ) : (
        <>
          {/* Plain text only — React escaping, `whitespace-pre-wrap` keeps
              the §3-legal newlines; never dangerouslySetInnerHTML. */}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#0F172A]">
            {comment.body}
          </p>

          {authenticated && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {mine ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11"
                    onClick={startEdit}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11"
                    aria-busy={deleteMut.isPending}
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(comment.commentId)}
                  >
                    {deleteMut.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </>
              ) : reportMut.isSuccess ? (
                <p role="status" className="text-xs font-medium text-[#10B981]">
                  Report sent — our moderators will review it.
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11"
                  onClick={() => setReportOpen(true)}
                >
                  Report
                </Button>
              )}
            </div>
          )}

          {deleteMut.error && (
            <p role="alert" className="mt-2 text-sm font-medium text-[#EF4444]">
              {describeCommentError(deleteMut.error, "comment")}
            </p>
          )}
        </>
      )}
      {reportOpen && (
        <CommentReportDialog
          commentId={comment.commentId}
          reportMut={reportMut}
          onClose={() => setReportOpen(false)}
        />
      )}
    </li>
  );
}

