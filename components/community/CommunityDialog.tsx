"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Shared modal shell for the Community dialogs (issue #44). Same a11y
 * baseline as the exam-editor `ConfirmDialog`: `role=dialog`/`aria-modal`,
 * labelled by the title, Esc + click-outside cancel (suppressed while busy),
 * focus lands on `[data-autofocus]` (or the panel) when the dialog opens, and
 * Tab/Shift+Tab cycle inside the panel (modal focus trap).
 */

/** Keyboard-focusable descendants inside a dialog panel (Tab trap targets). */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CommunityDialog({
  open,
  titleId,
  title,
  description,
  onCancel,
  busy = false,
  size = "md",
  children,
}: {
  open: boolean;
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  onCancel: () => void;
  /** Blocks Esc/backdrop cancel while a mutation is in flight. */
  busy?: boolean;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
      if (e.key === "Tab") {
        // Focus trap: an aria-modal dialog must not leak Tab to the page
        // behind it — cycle within the panel (itself the fallback target).
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (!panel.contains(active) || active === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (!panel.contains(active) || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

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
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          cardVariants({ variant: "elevated" }),
          "relative max-h-[90vh] w-full overflow-y-auto p-6 outline-none",
          size === "lg" ? "max-w-2xl" : "max-w-md"
        )}
      >
        <h2
          id={titleId}
          className="font-display text-lg font-bold tracking-tight text-[#0F172A]"
        >
          {title}
        </h2>
        {description && (
          <div className="mt-2 text-sm font-medium text-[#64748B]">{description}</div>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
