"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Badge, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Role-aware admin dashboard. The `/admin` layout already gates on
 * [ACADEMIC_ADMIN, SYSTEM_ADMIN]; this page branches on the specific role to
 * surface the right quick-action cards.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const isAcademic = roles.includes("ACADEMIC_ADMIN");
  const isSystem = roles.includes("SYSTEM_ADMIN");

  return (
    <div>
      <header className="mb-10 select-none">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl tracking-tight text-[#0F172A] sm:text-4xl">
            Admin <span className="gradient-text">Dashboard</span>
          </h1>
          {isAcademic && <Badge variant="accent">Academic Admin</Badge>}
          {isSystem && <Badge variant="default">System Admin</Badge>}
        </div>
        <p className="mt-2 text-sm font-medium text-[#64748B] sm:text-base">
          School-wide oversight and management tools.
        </p>
      </header>

      {isAcademic && (
        <section aria-label="Academic admin actions" className="mb-10">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            Academic administration
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard
              href="/admin/subjects"
              icon={<ClipboardListIcon />}
              title="Subjects"
              description="Browse and manage subjects across your school."
            />
            <ActionCard
              href="/exam-sessions"
              icon={<ClockIcon />}
              title="Exam sessions"
              description="Cross-school oversight of scheduled and live sessions."
            />
            <ActionCard
              href="/exam-sessions"
              icon={<ChartIcon />}
              title="Reporting"
              description="Drill into a session for results and statistics."
            />
            <ActionCard
              href="/admin/pending-students"
              icon={<UsersIcon />}
              title="Pending Students"
              description="Assign unassigned students to a school."
            />
          </div>
        </section>
      )}

      {isSystem && (
        <section aria-label="System admin actions" className="mb-10">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            System administration
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard
              href="/admin/users"
              icon={<UsersIcon />}
              title="Users"
              description="Manage user accounts and roles."
              soon
            />
            <ActionCard
              icon={<BuildingIcon />}
              title="Schools"
              description="Manage schools and their configuration."
              soon
            />
          </div>
        </section>
      )}

      {!isAcademic && !isSystem && (
        <div className={cn(cardVariants(), "p-8 text-center")}>
          <p className="font-display text-lg font-bold text-[#0F172A]">No admin tools available</p>
          <p className="mt-1 text-sm text-[#64748B]">
            Your account doesn&apos;t have an admin role assigned.
          </p>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  soon = false,
}: {
  href?: string;
  icon: ReactNode;
  title: string;
  description: string;
  soon?: boolean;
}) {
  const body = (
    <>
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)] transition-transform duration-200 group-hover:scale-105">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-relaxed text-[#64748B]">{description}</p>
      <span
        className={cn(
          "mt-auto flex items-center gap-2 pt-6 text-sm font-semibold",
          soon ? "text-[#94A3B8]" : "text-[#0052FF]"
        )}
      >
        {soon ? (
          "Coming soon"
        ) : (
          <>
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
          </>
        )}
      </span>
    </>
  );

  if (soon || !href) {
    return (
      <div className={cn(cardVariants({ variant: "elevated" }), "group flex min-h-[200px] flex-col p-8 opacity-80")}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        cardVariants({ variant: "elevated" }),
        "group flex min-h-[200px] flex-col p-8 outline-none transition-all duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
      )}
    >
      {body}
    </Link>
  );
}

function ClipboardListIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}
