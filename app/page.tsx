"use client";

import { useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Badge, SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
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
          <SectionLabel className="mb-4" pulse>
            Dashboard
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl tracking-tight text-[#0F172A] sm:text-4xl">
              Welcome back, <span className="gradient-text">{displayName}</span>
            </h1>
            {roleLabel && <Badge variant="accent">{roleLabel}</Badge>}
          </div>
          <p className="mt-2 text-sm font-medium text-[#64748B] sm:text-base">
            {subtitle}
          </p>
        </header>

        {/* Functional action cards */}
        {cards.length > 0 ? (
          <section
            aria-label="Quick actions"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {cards.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  cardVariants({ variant: "elevated" }),
                  "group flex min-h-[220px] flex-col p-8 outline-none hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
                )}
              >
                {/* Icon well — signature gradient */}
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)] transition-transform duration-200 group-hover:scale-105">
                  {item.icon}
                </div>

                <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
                  {item.label}
                </h2>
                {item.description && (
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[#64748B]">
                    {item.description}
                  </p>
                )}

                {/* Open affordance */}
                <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-[#0052FF]">
                  Open
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
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
            className={cn(
              cardVariants(),
              "flex min-h-[220px] items-center justify-center p-8"
            )}
          >
            <p className="max-w-sm text-center text-sm font-medium text-[#64748B]">
              Welcome, {displayName}. Your tools will appear here once your account is assigned a role.
            </p>
          </section>
        )}
      </AppShell>
    </RequireAuth>
  );
}
