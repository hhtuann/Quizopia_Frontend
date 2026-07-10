"use client";

import React, { useState } from "react";
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

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-[#0F172A]">
      <Header isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />

      {/* Main layout area */}
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden px-2 py-8 md:px-8">
          <div className="flex-1">{children}</div>
          <div className="mt-16">
            <Footer />
          </div>
        </main>
      </div>

      {/* Mobile navigation drawer (same items as the desktop sidebar) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-x-0 top-20 z-30 p-4 md:hidden">
          <nav
            id="mobile-navigation"
            role="navigation"
            aria-label="Mobile navigation"
            className={cn(cardVariants(), "space-y-2 p-5")}
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
