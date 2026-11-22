"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Shared centered modal shell (Create Class visual contract).
 *
 * A11y baseline mirrors `CommunityDialog`: `role=dialog`/`aria-modal`,
 * labelled by the title, Esc + backdrop close (suppressed while busy),
 * focus lands on `[data-autofocus]` (or the panel) on open, Tab/Shift+Tab
 * cycle inside the panel, focus returns to the opener on close, and the
 * background page scroll is locked while open.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  title,
  onClose,
  busy = false,
  size = "lg",
  children,
}: {
  title: string;
  onClose: () => void;
  /** Blocks Esc/backdrop close while a mutation is in flight. */
  busy?: boolean;
  /** Responsive panel width; forms default to `lg` (max-w-2xl). */
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Capture the opener on open; restore its focus on close/unmount (WAI-ARIA
  // modal dialog pattern). Keyed on mount only — later identity changes of
  // `onClose`/`busy` must not re-run this (cleanup would steal focus).
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  // Lock background scroll while the dialog is open.
  useEffect(() => {
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, []);

  // Initial focus + Esc close + Tab focus trap.
  useEffect(() => {
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
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
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          cardVariants({ variant: "elevated" }),
          "relative max-h-[90vh] w-full overflow-y-auto p-6 outline-none",
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            {title}
          </h2>
          <button
            type="button"
            onClick={busy ? undefined : onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] outline-none transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="no" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
