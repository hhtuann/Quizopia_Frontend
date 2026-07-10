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
    <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto md:flex md:w-64 md:flex-col md:space-y-8 md:border-r md:border-[#E2E8F0] md:p-6">
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
    </aside>
  );
}
