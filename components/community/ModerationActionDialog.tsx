"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  moderationNoteFormSchema,
  moderationReasonFormSchema,
  type ModerationNoteValues,
  type ModerationReasonValues,
} from "@/lib/validation/community-schemas";
import { Button } from "@/components/ui";
import { CommunityDialog } from "./CommunityDialog";

const textareaClass =
  "w-full min-h-[96px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

/**
 * Moderator action dialog (issue #44) — one shell for hide/restore (reason
 * MANDATORY per ADR-006 §4: submit stays blocked until non-empty) and report
 * dismiss/resolve (note optional per §7). RHF + zod keeps the block and the
 * ≤500 bound in one place.
 */
export function ModerationActionDialog({
  open,
  titleId,
  title,
  description,
  mode,
  confirmLabel,
  placeholder,
  busy,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  titleId: string;
  title: string;
  description?: string;
  mode: "reason" | "note";
  confirmLabel: string;
  placeholder?: string;
  busy: boolean;
  /** Receives the trimmed reason/note; callers forward it to the API. */
  onSubmit: (value: string | undefined) => void;
  onCancel: () => void;
}) {
  const reasonForm = useForm<ModerationReasonValues>({
    resolver: zodResolver(moderationReasonFormSchema),
    defaultValues: { reason: "" },
  });
  const noteForm = useForm<ModerationNoteValues>({
    resolver: zodResolver(moderationNoteFormSchema),
    defaultValues: { note: "" },
  });

  useEffect(() => {
    if (!open) return;
    reasonForm.reset({ reason: "" });
    noteForm.reset({ note: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (mode === "reason") {
    return (
      <CommunityDialog
        open={open}
        titleId={titleId}
        title={title}
        description={description}
        onCancel={busy ? () => undefined : onCancel}
        busy={busy}
      >
        <form
          noValidate
          onSubmit={reasonForm.handleSubmit((v) => onSubmit(v.reason.trim()))}
          className="space-y-4"
        >
          <div>
            <label htmlFor={`${titleId}-reason`} className="sr-only">
              Reason (required)
            </label>
            <textarea
              id={`${titleId}-reason`}
              data-autofocus
              maxLength={500}
              className={textareaClass}
              placeholder={placeholder ?? "Why are you taking this action? (required)"}
              aria-invalid={reasonForm.formState.errors.reason ? "true" : undefined}
              aria-describedby={reasonForm.formState.errors.reason ? `${titleId}-reason-error` : undefined}
              {...reasonForm.register("reason")}
            />
            {reasonForm.formState.errors.reason && (
              <p
                id={`${titleId}-reason-error`}
                role="alert"
                className="mt-1.5 pl-1 text-xs font-semibold text-[#EF4444]"
              >
                {reasonForm.formState.errors.reason.message}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={confirmLabel.toLowerCase().startsWith("hide") ? "destructive" : "primary"}
              disabled={busy}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </form>
      </CommunityDialog>
    );
  }

  return (
    <CommunityDialog
      open={open}
      titleId={titleId}
      title={title}
      description={description}
      onCancel={busy ? () => undefined : onCancel}
      busy={busy}
    >
      <form
        noValidate
        onSubmit={noteForm.handleSubmit((v) => onSubmit(v.note?.trim() || undefined))}
        className="space-y-4"
      >
        <div>
          <label htmlFor={`${titleId}-note`} className="sr-only">
            Note (optional)
          </label>
          <textarea
            id={`${titleId}-note`}
            data-autofocus
            maxLength={500}
            className={textareaClass}
            placeholder={placeholder ?? "Optional note recorded with this action."}
            aria-invalid={noteForm.formState.errors.note ? "true" : undefined}
            aria-describedby={noteForm.formState.errors.note ? `${titleId}-note-error` : undefined}
            {...noteForm.register("note")}
          />
          {noteForm.formState.errors.note && (
            <p
              id={`${titleId}-note-error`}
              role="alert"
              className="mt-1.5 pl-1 text-xs font-semibold text-[#EF4444]"
            >
              {noteForm.formState.errors.note.message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </CommunityDialog>
  );
}
