"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * User management — PLACEHOLDER. Page-level guard tightens to SYSTEM_ADMIN
 * (the `/admin` layout admits both admin roles). The user CRUD endpoints don't
 * exist yet, so this renders a "coming soon" card instead of a list.
 */
export default function AdminUsersPage() {
  return (
    <RequireAuth requireRole="SYSTEM_ADMIN">
      <div>
        <header className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Admin dashboard
          </Link>
          <SectionLabel className="mb-3 mt-3">Users</SectionLabel>
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            User Management
          </h1>
        </header>

        <div className={cn(cardVariants({ variant: "elevated" }), "flex flex-col items-center p-12 text-center")}>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <p className="font-display text-lg font-bold text-[#0F172A]">Coming soon</p>
          <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-[#64748B]">
            User management (list, create, role assignment, enable/disable) requires
            backend endpoints that aren&apos;t implemented yet. This page will be built
            once the user CRUD API is ready.
          </p>
        </div>
      </div>
    </RequireAuth>
  );
}
