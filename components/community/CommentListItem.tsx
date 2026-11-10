"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { describeCommentError } from "./community-errors";
import { CommentBodyTextarea } from "./CommentEditor";
import { CommentReportDialog } from "./CommentReportDialog";
import { InitialsAvatar } from "./InitialsAvatar";
import {
  useDeleteCommentMutation,
  useReportCommentMutation,
  useUpdateCommentMutation,
} from "@/hooks/queries/use-community-comments";
import type { CommunityComment } from "@/lib/api/community-comments";
import { communityCommentBodySchema } from "@/lib/validation/community-schemas";

/**
 * One discussion row (issue #73 — Epic #70 F5; ADR-007 Rev 4): compact
 * Facebook-style layout — circle initials avatar, bold public author name,
 * the plain-text body in a subtle light-gray rounded bubble of BOUNDED
 * width (short comments never stretch to full card width; long text
 * wraps), then the small timestamp / Edited marker and the action links
 * directly beneath the bubble. Vertical rhythm is tight (space-y-1),
 * replacing the former full-width bordered cards.
 *
 * OWNERSHIP (Rev 4 / #72): `comment.isMine` — the server-computed flag for
 * the authenticated viewer (never name-text equality; duplicate display
 * names are legal and the flag survives reloads and renames). Own rows get
 * Edit/Delete; foreign rows get Report; guests are read-only. The
 * server-scoped PATCH/DELETE remain the enforcement point — the flag only
 * decides which affordance renders.
 *
 * The body stays plain text (React escaping only — never HTML, never
 * `dangerouslySetInnerHTML`); `whitespace-pre-wrap` keeps the §3-legal
 * newlines.
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
}: {
  comment: CommunityComment;
  publicationId: number;
  authenticated: boolean;
}) {
  // Server-computed ownership — the single source of truth (see module doc).
  const mine = authenticated && comment.isMine;

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
    <li data-testid={`comment-${comment.commentId}`} className="flex gap-3">
      <InitialsAvatar name={comment.authorName} />
      <div className="min-w-0 max-w-[min(100%,42rem)] flex-1">
        <p className="text-sm font-semibold leading-tight text-[#0F172A]">
          {comment.authorName}
        </p>

        {editing ? (
          <form
            onSubmit={saveEdit}
            className="mt-1 space-y-2"
            aria-label="Edit comment"
          >
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
                disabled={!draftOk || updateMut.isPending}
                aria-busy={updateMut.isPending}
              >
                {updateMut.isPending ? "Saving…" : "Save"}
              </Button>
              {/* Edit-specific Cancel is the appropriate exception (F4). */}
              <Button
                type="button"
                variant="outline"
                size="sm"
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
            {/* Subtle light-gray rounded bubble, bounded above by the
                wrapper's max-w — short text stays compact, long text
                wraps; never an oversized full-width card. */}
            <p
              data-testid={`comment-bubble-${comment.commentId}`}
              className="mt-1 inline-block max-w-full rounded-2xl bg-[#F1F5F9] px-3.5 py-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#0F172A]"
            >
              {comment.body}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <time
                dateTime={comment.createdAt}
                className="text-xs font-medium text-[#64748B]"
              >
                {formatTimestamp(comment.createdAt)}
              </time>
              {comment.editedAt != null && (
                <span className="text-xs italic text-[#64748B]">Edited</span>
              )}

              {authenticated && (
                <>
                  {mine ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2.5"
                        onClick={startEdit}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2.5"
                        aria-busy={deleteMut.isPending}
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate(comment.commentId)}
                      >
                        {deleteMut.isPending ? "Deleting…" : "Delete"}
                      </Button>
                    </>
                  ) : reportMut.isSuccess ? (
                    <p
                      role="status"
                      className="text-xs font-medium text-[#10B981]"
                    >
                      Report sent — our moderators will review it.
                    </p>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2.5"
                      onClick={() => setReportOpen(true)}
                    >
                      Report
                    </Button>
                  )}
                </>
              )}
            </div>

            {deleteMut.error && (
              <p role="alert" className="mt-1 text-sm font-medium text-[#EF4444]">
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
      </div>
    </li>
  );
}
