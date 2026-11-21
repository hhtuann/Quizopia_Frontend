"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { navItemsForView, isActive } from "@/lib/navigation";
import { useActiveView } from "@/lib/view/store";

/**
 * Desktop navigation. Zero props — reads the authenticated user's roles and
 * active view plus the current pathname itself, then renders the filtered nav
 * items from the shared `lib/navigation` source of truth. Active link is
 * derived from `usePathname` (not local state) so it survives navigation and
 * refresh.
 *
 * Collapsed icon-only rail: labels appear in a floating tooltip to the right
 * on hover and keyboard focus (CSS-only via group/group-focus-visible). The
 * tooltip is absolutely positioned inside the fixed sidebar so it never
 * affects layout and renders above main content.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { view } = useActiveView();
  const items = navItemsForView(user?.roles, view);

  return (
    <aside className="app-sidebar hidden border-r border-[#E2E8F0] bg-[#FAFAFA] px-2 py-4 lg:flex lg:flex-col">
      {/* Navigation */}
      <nav className="flex flex-col items-center space-y-2" aria-label="Main navigation">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-lg outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA] ${
                active
                  ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                  : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center transition-all duration-200 ${
                  active ? "text-white" : "text-[#0052FF]"
                }`}
              >
                {item.icon}
              </span>
              {/* Floating label: right of the icon, above main content, no layout shift. */}
              <span
                role="tooltip"
                className="nav-tooltip pointer-events-none absolute left-full top-1/2 z-[var(--z-drawer)] ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0F172A] px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_4px_12px_rgba(15,23,42,0.25)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
