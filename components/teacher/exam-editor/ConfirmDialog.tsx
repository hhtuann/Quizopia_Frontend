"use client";

import { useEffect, useRef, type ReactNode } from "react";

const primaryBtn =
  "neumorphic-active-press inline-flex h-11 items-center justify-center rounded-button bg-[#6C63FF] px-5 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-button bg-[#E0E5EC] px-5 text-sm font-semibold text-[#3D4852] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]";

/**
 * Small neumorphic confirmation dialog. Used for irreversible actions (publish
 * = immutable snapshot). a11y baseline: focus moves to the safe (Cancel)
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
        className="absolute inset-0 bg-[#3D4852]/30 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-container bg-[#E0E5EC] p-6 shadow-extruded">
        <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-[#3D4852]">
          {title}
        </h2>
        {description && (
          <div className="mt-2 text-sm font-medium text-[#6B7280]">{description}</div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={secondaryBtn}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={primaryBtn}>
            {busy ? (busyLabel || "…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
