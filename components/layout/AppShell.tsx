"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
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
    <div className="flex min-h-screen flex-col bg-[#E0E5EC] text-[#3D4852]">
      <Header isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />

      {/* Main layout area */}
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden px-2 py-8 md:px-8">
          <div className="flex-1">{children}</div>
          <Footer />
        </main>
      </div>

      {/* Mobile navigation drawer (same items as the desktop sidebar) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-x-0 top-20 z-30 animate-fadeIn p-4 md:hidden">
          <nav
            id="mobile-navigation"
            role="navigation"
            aria-label="Mobile navigation"
            className="space-y-3 rounded-container bg-[#E0E5EC] p-6 shadow-extruded"
          >
            <p className="mb-2 pl-2 text-xs font-bold uppercase tracking-wider text-[#6B7280]">Navigation</p>
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-button px-5 py-4 text-sm font-semibold outline-none transition-all duration-300 ${
                    active
                      ? "translate-y-[0.5px] text-[#6C63FF] shadow-inset-pressed"
                      : "text-[#6B7280] shadow-extruded-small hover:text-[#3D4852] active:shadow-inset-small"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-inner text-[#6C63FF]">
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
