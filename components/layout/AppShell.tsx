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
import { navItemsForRoles, isActive } from "@/lib/navigation";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Application shell: Header + Sidebar + content + Footer, plus a mobile drawer
 * that mirrors the sidebar's role-filtered items (single source of truth in
 * `lib/navigation`). No fake tab state — navigation is real `<Link>`s and active
 * highlighting comes from `usePathname`.
 */
export default function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const items = navItemsForRoles(user?.roles);
  const drawerRef = useRef<HTMLElement>(null);

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
      <Header isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />

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
