"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityCategoriesQuery } from "@/hooks/queries/use-community";
import {
  useCreateCommunityPublicationMutation,
  usePublishCommunityPublicationMutation,
} from "@/hooks/queries/use-community-owner";
import {
  COMMUNITY_TAG_PATTERN,
  publishToCommunitySchema,
  type PublishToCommunityValues,
} from "@/lib/validation/community-schemas";
import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";
import { describeCommunityError } from "./community-errors";
import { CommunityDialog } from "./CommunityDialog";

const labelClass =
  "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";

const textareaClass =
  "w-full min-h-[80px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const selectClass =
  "h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

/**
 * "Publish to Community" dialog (P3-A-FE2, issue #44 — ADR-006 §4/§7/§10).
 *
 * Two-step flow per §4: `POST /api/community/publications` (creates the
 * UNPUBLISHED row) followed immediately by `POST …/{id}/publish`. Errors are
 * surfaced per step: a create failure leaves nothing behind; a publish
 * failure leaves an UNPUBLISHED row the teacher can retry from
 * /community/mine.
 *
 * Consent UX (§7/§10): the public credit alias is pre-filled from the user's
 * display name but MUST be explicitly acknowledged as publicly visible, and
 * ALLOW_FORK shows the copy warning — recipients get question + correct
 * answer copies — before it can be chosen.
 */
export function PublishToCommunityDialog({
  open,
  exam,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  exam: { id: number; title: string };
  onCancel: () => void;
  /** Called once the publication is live (create + publish both succeeded). */
  onSuccess: (publicationId: number) => void;
}) {
  const { user } = useAuth();
  const { data: categoriesData } = useCommunityCategoriesQuery();
  const createMut = useCreateCommunityPublicationMutation();
  const publishMut = usePublishCommunityPublicationMutation();

  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [existsConflict, setExistsConflict] = useState(false);
  const [savedUnpublished, setSavedUnpublished] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PublishToCommunityValues>({
    resolver: zodResolver(publishToCommunitySchema),
    defaultValues: {
      title: exam.title,
      summary: "",
      categoryId: "",
      tags: [],
      // §7: pre-filled from display name — behind the explicit acknowledgment.
      authorAlias: user?.displayName ?? "",
      aliasAcknowledged: false,
      reusePolicy: "NO_FORK",
    },
  });

  // Fresh form state every time the dialog opens (exam title may differ).
  useEffect(() => {
    if (!open) return;
    reset({
      title: exam.title,
      summary: "",
      categoryId: "",
      tags: [],
      authorAlias: user?.displayName ?? "",
      aliasAcknowledged: false,
      reusePolicy: "NO_FORK",
    });
    setTagDraft("");
    setTagError(null);
    setFormError(null);
    setExistsConflict(false);
    setSavedUnpublished(false);
    // `user` is read once at open; later store changes don't reseed the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exam.id, exam.title, reset]);

  const tags = watch("tags") ?? [];
  const reusePolicy = watch("reusePolicy");
  const busy = isSubmitting || createMut.isPending || publishMut.isPending;

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    setTagError(null);
    if (!tag) return;
    if (!COMMUNITY_TAG_PATTERN.test(tag)) {
      setTagError("Tags use 1–40 lowercase letters, digits, spaces or hyphens.");
      return;
    }
    if (tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    if (tags.length >= 5) {
      setTagError("Add at most 5 tags.");
      return;
    }
    setValue("tags", [...tags, tag], { shouldValidate: true });
    setTagDraft("");
  };

  const onSubmit = async (values: PublishToCommunityValues) => {
    setFormError(null);
    setExistsConflict(false);
    setSavedUnpublished(false);
    // Which step failed decides the follow-up copy: a create failure leaves
    // nothing behind; a publish failure leaves an UNPUBLISHED row.
    let createdId: number | null = null;
    try {
      const created = await createMut.mutateAsync({
        examId: exam.id,
        title: values.title.trim(),
        summary: values.summary?.trim() || undefined,
        categoryId:
          values.categoryId && values.categoryId !== ""
            ? Number(values.categoryId)
            : undefined,
        tags: values.tags,
        authorAlias: values.authorAlias.trim(),
        reusePolicy: values.reusePolicy,
      });
      createdId = created.publicationId;
      // Publish immediately (§4 two-step); idempotent 200 if already live.
      await publishMut.mutateAsync(created.publicationId);
      onSuccess(created.publicationId);
    } catch (err) {
      const norm = err as NormalizedApiError | undefined;
      const mapped = describeCommunityError(err);
      if (
        createdId !== null &&
        !(norm?.kind === "api" && norm.code === "COMMUNITY_PUBLICATION_EXISTS")
      ) {
        setSavedUnpublished(true);
      }
      if (norm?.kind === "api" && norm.code === "COMMUNITY_PUBLICATION_EXISTS") {
        setExistsConflict(true);
      }
      setFormError(mapped.message);
    }
  };
  return (
    <CommunityDialog
      open={open}
      titleId="publish-community-title"
      title="Publish to Community"
      description="Shares this exam's questions on the public community catalog. Your exam itself is not modified."
      onCancel={busy ? () => undefined : onCancel}
      busy={busy}
      size="lg"
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span>
              {formError}
              {existsConflict && (
                <>
                  {" "}
                  <Link
                    href="/community/mine"
                    className="rounded font-semibold text-[#0052FF] underline outline-none hover:text-[#0043CC] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                  >
                    Open My community publications
                  </Link>
                </>
              )}
              {savedUnpublished && !existsConflict && (
                <>
                  {" "}
                  It was saved as unpublished — manage it under{" "}
                  <Link
                    href="/community/mine"
                    className="rounded font-semibold text-[#0052FF] underline outline-none hover:text-[#0043CC] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                  >
                    My community publications
                  </Link>
                  .
                </>
              )}
            </span>
          </div>
        )}

        <div>
          <label htmlFor="community-pub-title" className={labelClass}>
            Title
          </label>
          <Input
            id="community-pub-title"
            data-autofocus
            maxLength={255}
            aria-invalid={errors.title ? "true" : undefined}
            aria-describedby={errors.title ? "community-pub-title-error" : undefined}
            {...register("title")}
          />
          <FieldError id="community-pub-title-error" message={errors.title?.message} />
        </div>

        <div>
          <label htmlFor="community-pub-summary" className={labelClass}>
            Summary <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <textarea
            id="community-pub-summary"
            maxLength={500}
            className={textareaClass}
            placeholder="What will takers learn from this quiz?"
            aria-invalid={errors.summary ? "true" : undefined}
            aria-describedby={errors.summary ? "community-pub-summary-error" : undefined}
            {...register("summary")}
          />
          <FieldError id="community-pub-summary-error" message={errors.summary?.message} />
        </div>

        <div>
          <label htmlFor="community-pub-category" className={labelClass}>
            Category <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <select id="community-pub-category" className={selectClass} {...register("categoryId")}>
            <option value="">No category</option>
            {(categoriesData ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="community-pub-tag-input" className={labelClass}>
            Tags <span className="font-normal normal-case text-[#64748B]/60">(up to 5)</span>
          </label>
          <div className="flex gap-2">
            <Input
              id="community-pub-tag-input"
              value={tagDraft}
              placeholder="e.g. algebra"
              className="h-11"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 px-4"
              onClick={() => addTag(tagDraft)}
            >
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Selected tags">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setValue(
                      "tags",
                      tags.filter((t) => t !== tag),
                      { shouldValidate: true }
                    )
                  }
                  className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#0052FF]/30 bg-[#0052FF]/5 px-4 text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:border-[#EF4444]/30 hover:bg-[#EF4444]/5 hover:text-[#EF4444] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                  aria-label={`Remove tag ${tag}`}
                >
                  {tag}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              ))}
            </div>
          )}
          <FieldError
            id="community-pub-tags-error"
            message={tagError ?? errors.tags?.message}
          />
        </div>

        <div>
          <label htmlFor="community-pub-alias" className={labelClass}>
            Public credit alias
          </label>
          <Input
            id="community-pub-alias"
            maxLength={80}
            aria-invalid={errors.authorAlias ? "true" : undefined}
            aria-describedby={
              errors.authorAlias
                ? "community-pub-alias-error"
                : "community-pub-alias-hint"
            }
            {...register("authorAlias")}
          />
          <p
            id="community-pub-alias-hint"
            className="mt-1.5 pl-1 text-xs font-medium text-[#64748B]"
          >
            Shown next to your quiz on the public community catalog. Don&apos;t use
            your email or username — it is visible to everyone.
          </p>
          <FieldError
            id="community-pub-alias-error"
            message={errors.authorAlias?.message}
          />
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-3">
            <input
              id="community-pub-ack"
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 rounded border-[#94A3B8] accent-[#0052FF]"
              aria-invalid={errors.aliasAcknowledged ? "true" : undefined}
              aria-describedby={
                errors.aliasAcknowledged ? "community-pub-ack-error" : undefined
              }
              {...register("aliasAcknowledged")}
            />
            <label
              htmlFor="community-pub-ack"
              className="text-xs font-semibold leading-relaxed text-[#0F172A]"
            >
              I understand this alias will be publicly visible to everyone on
              the community catalog.
            </label>
          </div>
          <FieldError
            id="community-pub-ack-error"
            message={errors.aliasAcknowledged?.message}
          />
        </div>

        <fieldset>
          <legend className={labelClass}>Reuse policy</legend>
          <div className="space-y-2">
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium transition-colors",
                reusePolicy === "NO_FORK"
                  ? "border-[#0052FF]/40 bg-[#0052FF]/5 text-[#0F172A]"
                  : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0052FF]/30"
              )}
            >
              <input
                type="radio"
                value="NO_FORK"
                className="h-4 w-4 accent-[#0052FF]"
                {...register("reusePolicy")}
              />
              <span>
                No forking — everyone can browse and take the quiz, but nobody
                receives a copy. <Badge>Default</Badge>
              </span>
            </label>
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium transition-colors",
                reusePolicy === "ALLOW_FORK"
                  ? "border-[#0052FF]/40 bg-[#0052FF]/5 text-[#0F172A]"
                  : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0052FF]/30"
              )}
            >
              <input
                type="radio"
                value="ALLOW_FORK"
                className="h-4 w-4 accent-[#0052FF]"
                {...register("reusePolicy")}
              />
              <span>Allow forking — teachers can copy this quiz into their own bank.</span>
            </label>
          </div>
          {reusePolicy === "ALLOW_FORK" && (
            <div
              role="status"
              className="mt-2 flex items-start gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3 text-xs font-semibold leading-relaxed text-[#0F172A]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              <span>
                Consent warning: recipients receive a full copy of every question
                AND its correct answer. Forked copies are independent — you
                cannot revoke or modify them later.
              </span>
            </div>
          )}
          <FieldError id="community-pub-reuse-error" message={errors.reusePolicy?.message} />
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Publishing…" : "Publish to community"}
          </Button>
        </div>
      </form>
    </CommunityDialog>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#EF4444]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
      {message}
    </p>
  );
}
