"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Small confirmation dialog. Used for irreversible actions (publish =
 * immutable snapshot). a11y baseline: focus moves to the safe (Cancel)
 * button on open, Esc + click-outside cancel, `role=dialog`/`aria-modal`,
 * labelled by the title.
 */
export function ConfirmDialog({
  open,
  titleId,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus to the least-destructive button (safe default).
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className={cn(cardVariants({ variant: "elevated" }), "relative w-full max-w-md p-6")}>
        <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          {title}
        </h2>
        {description && (
          <div className="mt-2 text-sm font-medium text-[#64748B]">{description}</div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonVariants({ variant: "outline" })}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={buttonVariants({ variant: "primary" })}>
            {busy ? (busyLabel || "…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
