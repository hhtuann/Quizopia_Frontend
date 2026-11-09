"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { describeCommentError } from "./community-errors";
import {
  useCreateCommentMutation,
  useMyCommentAliasQuery,
} from "@/hooks/queries/use-community-comments";
import {
  COMMUNITY_COMMENT_ALIAS_MAX,
  COMMUNITY_COMMENT_BODY_MAX,
  communityCommentAliasSchema,
  communityCommentBodySchema,
} from "@/lib/validation/community-schemas";

/**
 * Comment editor (P3-C4, issue #68 — ADR-007 §4/§7).
 *
 * FIRST-COMMENT ALIAS CAPTURE — the exact heuristic, documented once:
 * the §5 comment DTO exposes an author ONLY as `authorAlias` (no user id,
 * no ownership flag), so the FE cannot ask the server "do I already have a
 * display name?". It therefore keeps an alias field visible in the editor
 * UNTIL a create succeeds in this session — the create response's
 * `authorAlias` (the post-upsert STORED snapshot, §4) is written to the
 * cache-only `["community","comments","my-alias"]` entry and the field
 * collapses to "Posting as …". Consequences, deliberate:
 * - A user who commented in an earlier session sees the alias field once
 *   more; resubmitting the same name is a server-side no-op (§4 upsert), and
 *   typing a different name is a legitimate §4 alias change.
 * - The consent copy "This name is publicly visible next to your comments."
 *   shows whenever the field is open with a value that DIFFERS from the
 *   last-known stored alias (first capture: nothing stored ⇒ always shown;
 *   §4 re-consent on change), and is hidden when the value matches (nothing
 *   changes).
 * - 409 `COMMUNITY_ALIAS_TAKEN` keeps the typed body + name in place with
 *   the actionable retry copy — the server aborted atomically (§4), so
 *   nothing partial landed.
 *
 * Body bounds (§3): plain text ≤2000 chars, non-blank; the live count
 * disables submit over/under the bounds.
 */

/** Live-count textarea shared by the create editor and the inline edit form. */
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
        rows={4}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add to the discussion…"
        className="w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm leading-relaxed text-[#0F172A] outline-none transition-all duration-200 placeholder:text-[#64748B]/50 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
  const aliasQ = useMyCommentAliasQuery();
  const storedAlias = aliasQ.data ?? null;

  const [body, setBody] = useState("");
  const [alias, setAlias] = useState(() => storedAlias ?? "");
  // Open until the first successful create stores the alias (heuristic above).
  const [aliasOpen, setAliasOpen] = useState(() => storedAlias == null);
  const [tried, setTried] = useState(false);

  // Forced while no alias is known — the first comment MUST carry one (§4).
  const showAlias = aliasOpen || storedAlias == null;

  const bodyOk = communityCommentBodySchema.safeParse(body).success;
  const bodyOver = body.length > COMMUNITY_COMMENT_BODY_MAX;
  const aliasOk = communityCommentAliasSchema.safeParse(alias).success;
  const aliasOver = alias.length > COMMUNITY_COMMENT_ALIAS_MAX;

  // Settled create (mutate callback — event-time, not an effect): clear the
  // form, collapse the alias capture, surface the posted notice until the
  // next keystroke.
  const [posted, setPosted] = useState(false);
  const errorCopy = createMut.error ? describeCommentError(createMut.error) : null;

  const canSubmit = bodyOk && aliasOk && !createMut.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!canSubmit) return;
    createMut.mutate(
      {
        body,
        // Omitted when unchanged — §4: subsequent comments default to the
        // stored alias; sending it only when the field is open keeps a
        // confirmed-identical resubmission from re-running alias validation.
        alias: showAlias ? alias.trim() : undefined,
      },
      {
        onSuccess: () => {
          setBody("");
          setAliasOpen(false);
          setTried(false);
          setPosted(true);
        },
      }
    );
  };

  const reset = () => {
    createMut.reset();
    setBody("");
    setAlias(storedAlias ?? "");
    setAliasOpen(storedAlias == null);
    setTried(false);
    setPosted(false);
  };

  return (
    <form
      aria-label="Add a comment"
      data-testid="comment-editor"
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]/60 p-4"
    >
      {showAlias ? (
        <div className="space-y-1">
          <label
            htmlFor="comment-alias"
            className="block text-xs font-semibold uppercase tracking-wide text-[#64748B]"
          >
            Display name
          </label>
          <Input
            id="comment-alias"
            value={alias}
            aria-invalid={aliasOver || undefined}
            aria-describedby={
              storedAlias == null || alias.trim() !== storedAlias
                ? "comment-alias-consent"
                : undefined
            }
            placeholder="How your name appears next to your comments"
            className="h-11"
            onChange={(e) => setAlias(e.target.value)}
          />
          {/* §4 consent copy — first capture, or a change from the stored name. */}
          {(storedAlias == null || alias.trim() !== storedAlias) && (
            <p
              id="comment-alias-consent"
              data-testid="alias-consent"
              className="text-xs leading-relaxed text-[#64748B]"
            >
              This name is publicly visible next to your comments.
            </p>
          )}
          {!aliasOk && (tried || alias.length > 0) && (
            <p role="alert" className="text-xs font-medium text-[#EF4444]">
              {aliasOver
                ? `Display names must be ${COMMUNITY_COMMENT_ALIAS_MAX} characters or fewer.`
                : "A display name is required to comment."}
            </p>
          )}
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[#64748B]">
          Posting as{" "}
          <span className="font-semibold text-[#0F172A]">{storedAlias}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11"
            onClick={() => setAliasOpen(true)}
          >
            Change
          </Button>
        </p>
      )}

      <CommentBodyTextarea
        id="comment-body"
        value={body}
        onChange={(next) => {
          setBody(next);
          setPosted(false);
        }}
        disabled={createMut.isPending}
      />
      {tried && !bodyOk && !bodyOver && (
        <p role="alert" className="text-sm font-medium text-[#EF4444]">
          Write a comment before posting.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="h-11"
          disabled={!canSubmit}
          aria-busy={createMut.isPending}
        >
          {createMut.isPending ? "Posting…" : "Post comment"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={reset}
          disabled={createMut.isPending}
        >
          Cancel
        </Button>
      </div>

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
    </form>
  );
}
