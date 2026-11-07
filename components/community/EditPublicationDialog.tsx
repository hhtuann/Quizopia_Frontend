"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUpdateCommunityPublicationMutation } from "@/hooks/queries/use-community-owner";
import {
  COMMUNITY_TAG_PATTERN,
  editPublicationSchema,
  type EditPublicationValues,
} from "@/lib/validation/community-schemas";
import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { OwnerPublication } from "@/lib/api/community-owner";
import { describeCommunityError } from "./community-errors";
import { CommunityDialog } from "./CommunityDialog";

const labelClass =
  "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";

const textareaClass =
  "w-full min-h-[80px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const selectClass =
  "h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

/**
 * Edit-details dialog for one owned publication (issue #44) — the §4
 * PATCHable set `{title, summary, categoryId, tags, authorAlias,
 * reusePolicy}` sent with `expectedVersion`. On 409
 * `COMMUNITY_CONCURRENT_MODIFICATION` the hook already invalidated the owner
 * list; this dialog closes and lets the caller surface the conflict copy so
 * the teacher retries against the fresh `version`.
 *
 * Category note: the §7 owner DTO carries `categoryCode`/`categoryTitle`
 * (public card fields), not the id — so the select starts neutral, shows the
 * current category as a hint, and PATCHes `categoryId` only when the teacher
 * actively re-picks it (untouched → omitted, never cleared by accident).
 */
export function EditPublicationDialog({
  open,
  publication,
  categories,
  onCancel,
  onSaved,
  onConflict,
}: {
  open: boolean;
  publication: OwnerPublication;
  categories: { id: number; title: string }[];
  onCancel: () => void;
  onSaved: () => void;
  /** Called with actionable copy when the PATCH hit a 409/404 — dialog closes. */
  onConflict: (message: string) => void;
}) {
  const updateMut = useUpdateCommunityPublicationMutation(publication.publicationId);

  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditPublicationValues>({
    resolver: zodResolver(editPublicationSchema),
    defaultValues: toFormValues(publication),
  });

  // Reseed from the (possibly refetched) publication each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    reset(toFormValues(publication));
    setTagDraft("");
    setTagError(null);
    setFormError(null);
    setCategoryTouched(false);
  }, [open, publication, reset]);

  const tags = watch("tags") ?? [];
  const reusePolicy = watch("reusePolicy");
  const busy = isSubmitting || updateMut.isPending;

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

  const onSubmit = async (values: EditPublicationValues) => {
    setFormError(null);
    try {
      await updateMut.mutateAsync({
        title: values.title.trim(),
        summary: values.summary?.trim() || null,
        ...(categoryTouched
          ? {
              categoryId:
                values.categoryId && values.categoryId !== ""
                  ? Number(values.categoryId)
                  : null,
            }
          : {}),
        tags: values.tags,
        authorAlias: values.authorAlias.trim(),
        reusePolicy: values.reusePolicy,
        expectedVersion: publication.version,
      });
      onSaved();
    } catch (err) {
      const mapped = describeCommunityError(err);
      if (mapped.conflict || mapped.notFound) {
        onConflict(mapped.message);
        return;
      }
      setFormError(mapped.message);
    }
  };

  return (
    <CommunityDialog
      open={open}
      titleId="edit-publication-title"
      title="Edit community details"
      description="Only the public catalog entry changes — your exam is untouched."
      onCancel={busy ? () => undefined : onCancel}
      busy={busy}
      size="lg"
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
          >
            {formError}
          </div>
        )}

        <div>
          <label htmlFor="edit-pub-title" className={labelClass}>
            Title
          </label>
          <Input
            id="edit-pub-title"
            data-autofocus
            maxLength={255}
            aria-invalid={errors.title ? "true" : undefined}
            aria-describedby={errors.title ? "edit-pub-title-error" : undefined}
            {...register("title")}
          />
          <FieldError id="edit-pub-title-error" message={errors.title?.message} />
        </div>

        <div>
          <label htmlFor="edit-pub-summary" className={labelClass}>
            Summary <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <textarea
            id="edit-pub-summary"
            maxLength={500}
            className={textareaClass}
            aria-invalid={errors.summary ? "true" : undefined}
            aria-describedby={errors.summary ? "edit-pub-summary-error" : undefined}
            {...register("summary")}
          />
          <FieldError id="edit-pub-summary-error" message={errors.summary?.message} />
        </div>

        <div>
          <label htmlFor="edit-pub-category" className={labelClass}>
            Category
          </label>
          <select
            id="edit-pub-category"
            className={selectClass}
            value={watch("categoryId") ?? ""}
            onChange={(e) => {
              setValue("categoryId", e.target.value);
              setCategoryTouched(true);
            }}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <p className="mt-1.5 pl-1 text-xs font-medium text-[#64748B]">
            Current: {publication.categoryTitle ?? "No category"} — picking here
            replaces it.
          </p>
        </div>

        <div>
          <label htmlFor="edit-pub-tag-input" className={labelClass}>
            Tags <span className="font-normal normal-case text-[#64748B]/60">(up to 5)</span>
          </label>
          <div className="flex gap-2">
            <Input
              id="edit-pub-tag-input"
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
            id="edit-pub-tags-error"
            message={tagError ?? errors.tags?.message}
          />
        </div>

        <div>
          <label htmlFor="edit-pub-alias" className={labelClass}>
            Public credit alias
          </label>
          <Input
            id="edit-pub-alias"
            maxLength={80}
            aria-invalid={errors.authorAlias ? "true" : undefined}
            aria-describedby={
              errors.authorAlias ? "edit-pub-alias-error" : "edit-pub-alias-hint"
            }
            {...register("authorAlias")}
          />
          <p
            id="edit-pub-alias-hint"
            className="mt-1.5 pl-1 text-xs font-medium text-[#64748B]"
          >
            Publicly visible next to your quiz on the community catalog.
          </p>
          <FieldError id="edit-pub-alias-error" message={errors.authorAlias?.message} />
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
                No forking — nobody receives a copy.{" "}
                {publication.reusePolicy === "NO_FORK" && <Badge>Current</Badge>}
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
              <span>
                Allow forking — teachers can copy this quiz.{" "}
                {publication.reusePolicy === "ALLOW_FORK" && <Badge>Current</Badge>}
              </span>
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
                AND its correct answer. Existing forks are independent — revoking
                this later does not recall them.
              </span>
            </div>
          )}
          <FieldError id="edit-pub-reuse-error" message={errors.reusePolicy?.message} />
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </Button>
        </div>
      </form>
    </CommunityDialog>
  );
}

function toFormValues(publication: OwnerPublication): EditPublicationValues {
  return {
    title: publication.title,
    summary: publication.summary ?? "",
    categoryId: "",
    tags: publication.tags,
    authorAlias: publication.authorAlias ?? publication.authorName ?? "",
    reusePolicy: publication.reusePolicy,
  };
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
