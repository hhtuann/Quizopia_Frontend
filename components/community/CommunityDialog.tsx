"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Shared modal shell for the Community dialogs (issue #44). Same a11y
 * baseline as the exam-editor `ConfirmDialog`: `role=dialog`/`aria-modal`,
 * labelled by the title, Esc + click-outside cancel (suppressed while busy),
 * focus lands on `[data-autofocus]` (or the panel) when the dialog opens,
 * Tab/Shift+Tab cycle inside the panel (modal focus trap), and focus returns
 * to the opener when the dialog closes or unmounts.
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

  // Capture the opener on open; restore its focus on close/unmount (WAI-ARIA
  // modal dialog pattern). Keyed on `open` only — a `busy`/`onCancel` identity
  // change must NOT re-run this (the cleanup would steal focus mid-dialog).
  useEffect(() => {
    if (!open) return;
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restore = () => {
      if (opener && opener.isConnected) opener.focus();
    };
    return restore;
  }, [open]);

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
