"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { describeCommentError } from "./community-errors";
import { InitialsAvatar } from "./InitialsAvatar";
import { useCreateCommentMutation } from "@/hooks/queries/use-community-comments";
import { useAuth } from "@/hooks/useAuth";
import { COMMUNITY_COMMENT_BODY_MAX, communityCommentBodySchema } from "@/lib/validation/community-schemas";

/**
 * Comment composer (issue #73 — Epic #70 F4/F6; ADR-007 Rev 4): a compact
 * Facebook-style row — circular initials avatar, the signed-in account
 * `displayName` in bold, ONE text entry and a single post action.
 *
 * No display-name/alias input and no consent copy: the backend derives the
 * author identity and public name from the authenticated session (body-only
 * create; a legacy `alias` field would be ignored server-side). The small
 * informative line states that the name is public — it is a disclosure,
 * never a confirmation gate. No everyday Cancel button: an empty composer
 * has nothing to cancel; the posted/error notices clear on the next
 * keystroke.
 *
 * Body bounds (§3): plain text ≤2000 chars, non-blank; the live count
 * disables submit over/under the bounds. Duplicate submits are impossible
 * while pending (`isPending` disables the action).
 */

/** Live-count textarea shared by the composer and the inline edit form. */
export function CommentBodyTextarea({
  id,
  value,
  onChange,
  disabled = false,
  label = "Comment",
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Accessible name (no visible label — the count carries the affordance). */
  label?: string;
}) {
  const countId = `${id}-count`;
  const over = value.length > COMMUNITY_COMMENT_BODY_MAX;
  return (
    <div>
      <textarea
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-describedby={countId}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add to the discussion…"
        className="w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-2.5 text-sm leading-relaxed text-[#0F172A] outline-none transition-all duration-200 placeholder:text-[#64748B]/50 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p
        id={countId}
        data-testid="comment-char-count"
        className={cn(
          "mt-1 text-right text-xs font-medium",
          over ? "text-[#EF4444]" : "text-[#64748B]"
        )}
      >
        {value.length}/{COMMUNITY_COMMENT_BODY_MAX}
        {over
          ? ` — comments must be ${COMMUNITY_COMMENT_BODY_MAX} characters or fewer.`
          : ""}
      </p>
    </div>
  );
}

export function CommentEditor({ publicationId }: { publicationId: number }) {
  const createMut = useCreateCommentMutation(publicationId);
  const { user } = useAuth();
  const displayName = user?.displayName ?? "";

  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  // Settled create (mutate callback — event-time, not an effect): clear the
  // form and surface the posted notice until the next keystroke.
  const [posted, setPosted] = useState(false);
  const errorCopy = createMut.error
    ? describeCommentError(createMut.error, "publication")
    : null;

  const bodyOk = communityCommentBodySchema.safeParse(body).success;
  const canSubmit = bodyOk && !createMut.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!canSubmit) return;
    createMut.mutate(
      { body },
      {
        onSuccess: () => {
          setBody("");
          setTried(false);
          setPosted(true);
        },
      }
    );
  };

  return (
    <form
      aria-label="Add a comment"
      data-testid="comment-editor"
      onSubmit={onSubmit}
      className="flex gap-3"
    >
      <InitialsAvatar name={displayName} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {/* The account's CURRENT name — shown automatically, never typed. */}
          <span
            data-testid="composer-author-name"
            className="text-sm font-semibold text-[#0F172A]"
          >
            {displayName}
          </span>
          {/* Disclosure, not consent — no confirmation gate (F6). */}
          <span className="text-xs text-[#64748B]">
            Your display name is publicly visible next to your comments.
          </span>
        </div>

        <CommentBodyTextarea
          id="comment-body"
          value={body}
          onChange={(next) => {
            setBody(next);
            setPosted(false);
          }}
          disabled={createMut.isPending}
        />
        {tried && !bodyOk && (
          <p role="alert" className="text-sm font-medium text-[#EF4444]">
            Write a comment before posting.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={!canSubmit}
            aria-busy={createMut.isPending}
          >
            {createMut.isPending ? "Posting…" : "Post comment"}
          </Button>
          {posted && (
            <p role="status" className="text-sm font-medium text-[#10B981]">
              Comment posted.
            </p>
          )}
          {errorCopy && (
            <p role="alert" className="text-sm font-medium text-[#EF4444]">
              {errorCopy}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
