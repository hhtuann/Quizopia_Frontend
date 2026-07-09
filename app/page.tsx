"use client";

import { useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { navItemsForRoles } from "@/lib/navigation";

/** Friendly labels for the role codes returned by `GET /api/auth/me`. */
const ROLE_LABELS: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ACADEMIC_ADMIN: "Academic Admin",
  SYSTEM_ADMIN: "System Admin",
};

export default function Home() {
  const { user } = useAuth();

  // Prefer the registered display name, fall back to the username, then a neutral greeting.
  const displayName = user?.displayName?.trim() || user?.username || "there";

  const roleLabel = useMemo(() => {
    const known = user?.roles?.find((r) => ROLE_LABELS[r]);
    if (known) return ROLE_LABELS[known];
    const fallback = user?.roles?.[0];
    return fallback ? (ROLE_LABELS[fallback] ?? fallback) : null;
  }, [user]);

  // Functional cards = the same role-filtered nav the sidebar uses, minus the Dashboard itself.
  const cards = useMemo(
    () => navItemsForRoles(user?.roles).filter((item) => item.href !== "/"),
    [user]
  );

  const subtitle =
    user?.roles?.includes("TEACHER")
      ? "Manage your question banks, build exams, and run live sessions."
      : user?.roles?.includes("STUDENT")
        ? "Jump into an available session or review your past attempts."
        : "Choose an area below to get started.";

  return (
    <RequireAuth>
      <AppShell>
        {/* Welcome header */}
        <header className="mb-10 select-none">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display font-extrabold text-3xl tracking-tight text-[#3D4852] sm:text-4xl">
              Dashboard
            </h1>
            {roleLabel && (
              <span className="inline-flex items-center rounded-full bg-[#E0E5EC] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#6C63FF] shadow-inset-small">
                {roleLabel}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-medium text-[#6B7280] sm:text-base">
            Welcome back, <span className="font-semibold text-[#6C63FF]">{displayName}</span>. {subtitle}
          </p>
        </header>

        {/* Functional action cards */}
        {cards.length > 0 ? (
          <section
            aria-label="Quick actions"
            className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3"
          >
            {cards.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-[220px] flex-col rounded-container bg-[#E0E5EC] p-8 shadow-extruded outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
              >
                {/* Icon well — inset deep, "drilled" into the card */}
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-inner bg-[#E0E5EC] text-[#6C63FF] shadow-inset-deep transition-transform duration-300 group-hover:scale-105">
                  {item.icon}
                </div>

                <h2 className="font-display text-lg font-bold tracking-tight text-[#3D4852]">
                  {item.label}
                </h2>
                {item.description && (
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[#6B7280]">
                    {item.description}
                  </p>
                )}

                {/* Open affordance */}
                <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-[#6C63FF]">
                  Open
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </Link>
            ))}
          </section>
        ) : (
          <section
            aria-label="Quick actions"
            className="flex min-h-[220px] items-center justify-center rounded-container bg-[#E0E5EC] p-8 shadow-inset-pressed"
          >
            <p className="max-w-sm text-center text-sm font-medium text-[#6B7280]">
              Welcome, {displayName}. Your tools will appear here once your account is assigned a role.
            </p>
          </section>
        )}
      </AppShell>
    </RequireAuth>
  );
}
