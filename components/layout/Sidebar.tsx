"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { navItemsForRoles, isActive } from "@/lib/navigation";

/**
 * Desktop navigation. Zero props — reads the authenticated user's roles and the
 * current pathname itself, then renders the role-filtered nav items from the
 * shared `lib/navigation` source of truth. Active link is derived from
 * `usePathname` (not local state) so it survives navigation and refresh.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = navItemsForRoles(user?.roles);

  return (
    <aside className="hidden md:flex flex-col w-64 select-none space-y-8 border-r border-[#E2E8F0] p-6">
      {/* Navigation */}
      <nav className="flex flex-col space-y-2" aria-label="Main navigation">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA] ${
                active
                  ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                  : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 ${
                  active ? "text-white" : "text-[#0052FF]"
                }`}
              >
                {item.icon}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Minimalist brand accent (replaces the neumorphic Q graphic) */}
      <div className="flex flex-1 items-end justify-center pb-4">
        <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_4px_6px_rgba(0,0,0,0.07)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] font-display text-xl text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
            Q
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#10B981]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#64748B]">
              Quizopia
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
