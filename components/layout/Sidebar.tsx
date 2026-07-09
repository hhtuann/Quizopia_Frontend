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
    <aside className="hidden md:flex flex-col w-64 select-none space-y-8 bg-[#E0E5EC] p-6">
      {/* Navigation */}
      <nav className="flex flex-col space-y-4" aria-label="Main navigation">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-4 rounded-button px-5 py-4 text-sm font-semibold outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] ${
                active
                  ? "translate-y-[0.5px] text-[#6C63FF] shadow-inset-pressed"
                  : "text-[#6B7280] shadow-extruded-small hover:-translate-y-0.5 hover:text-[#3D4852] hover:shadow-extruded active:translate-y-[0.5px] active:shadow-inset-small"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-inner transition-all duration-300 ${
                  active ? "text-[#6C63FF] shadow-inset-small" : "text-[#6B7280] shadow-extruded-small"
                }`}
              >
                {item.icon}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Decorative tactile graphic (brand elevation) */}
      <div className="flex flex-1 items-end justify-center pb-4">
        <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-container bg-[#E0E5EC] shadow-extruded">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#E0E5EC] shadow-inset-deep">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E0E5EC] text-xl font-extrabold text-[#6C63FF] shadow-extruded animate-float">
              Q
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
