"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { navItemsForView, isActive } from "@/lib/navigation";
import { useActiveView } from "@/lib/view/store";
import { ViewTransitionOverlay, TEACHER_TRANSITION_MESSAGE, STUDENT_TRANSITION_MESSAGE } from "./ViewTransitionOverlay";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Application shell: Header + Sidebar + content + Footer, plus a mobile drawer
 * that mirrors the sidebar's items (single source of truth in
 * `lib/navigation`, filtered by the active view). No fake tab state —
 * navigation is real `<Link>`s and active highlighting comes from
 * `usePathname`. The view-transition overlay lives here so every view switch
 * (menu-driven) covers the whole shell exactly once.
 */
export default function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { view, changeView } = useActiveView();
  const items = navItemsForView(user?.roles, view);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  /**
   * Minimum time the transition overlay stays on screen (ms). The switch
   * itself settles in one commit; the deliberate beat makes the hand-off
   * between views feel intentional instead of instantaneous.
   */
  const transitionTimer = useRef<number | null>(null);
  const MIN_TRANSITION_MS = 1500;

  /** Menu-driven view switch with the branded overlay (>=1.5s). */
  const switchView = (next: "student" | "teacher") => {
    if (next === view) return;
    setTransitionMessage(next === "teacher" ? TEACHER_TRANSITION_MESSAGE : STUDENT_TRANSITION_MESSAGE);
    if (transitionTimer.current != null) {
      window.clearTimeout(transitionTimer.current);
    }
    const startedAt = Date.now();
    try {
      changeView(next);
      // Hold the branded overlay for the full beat: the new view's nav is
      // rendered in the same commit, so we simply delay the reveal.
      const remaining = Math.max(0, MIN_TRANSITION_MS - (Date.now() - startedAt));
      transitionTimer.current = window.setTimeout(() => {
        transitionTimer.current = null;
        setTransitionMessage(null);
      }, remaining);
    } catch {
      // Error recovery: never leave the user stuck on the overlay.
      setTransitionMessage(null);
    }
  };

  // Clear any pending overlay timer on unmount.
  useEffect(() => () => {
    if (transitionTimer.current != null) {
      window.clearTimeout(transitionTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches) setIsMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="app-shell flex flex-col bg-[#FAFAFA] text-[#0F172A]">
      <Header
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        onViewSwitch={switchView}
      />
      <ViewTransitionOverlay open={transitionMessage !== null} message={transitionMessage ?? ""} />

      {/* Main layout area */}
      <div className="flex w-full min-w-0 flex-1">
        <Sidebar />

        <main inert={isMobileMenuOpen} className="app-main flex min-w-0 flex-1 flex-col">
          <div className="page-fluid flex-1">{children}</div>
          <div className="mt-16">
            <Footer />
          </div>
        </main>
      </div>

      {/* Mobile navigation drawer (same items as the desktop sidebar) */}
      {isMobileMenuOpen && (
        <div className="app-mobile-navigation lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-[#0F172A]/30"
          />
          <nav
            ref={drawerRef}
            id="mobile-navigation"
            role="navigation"
            aria-label="Mobile navigation"
            className={cn(cardVariants(), "relative h-full w-[min(20rem,calc(100%-3rem))] space-y-2 overflow-y-auto overscroll-contain rounded-l-none p-4")}
          >
            <p className="mb-2 pl-2 font-mono text-xs uppercase tracking-[0.15em] text-[#64748B]">Navigation</p>
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA] ${
                    active
                      ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                      : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "text-white" : "text-[#0052FF]"}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
