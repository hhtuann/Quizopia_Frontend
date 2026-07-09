"use client";

import Link from "next/link";
import { useSubjectsQuery } from "@/hooks/queries/use-subjects";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { SubjectView } from "@/lib/api/subjects";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Admin subject list. Page-level guard tightens to ACADEMIC_ADMIN (the
 * `/admin` layout admits both admin roles). Reuses the FE5 `useSubjectsQuery`
 * (GET /api/subjects — school-scoped, active only). The response is a flat
 * `items[]` with no pagination, so this is a single-page bordered table.
 */
export default function AdminSubjectsPage() {
  return (
    <RequireAuth requireRole="ACADEMIC_ADMIN">
      <SubjectList />
    </RequireAuth>
  );
}

function SubjectList() {
  const { data, isPending, isError, error } = useSubjectsQuery();
  const items = data?.items ?? [];

  return (
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
        <SectionLabel className="mb-3 mt-3">Subjects</SectionLabel>
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Subjects
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Active subjects in your school.
        </p>
      </header>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <SubjectsTable items={items} />
        )}
      </div>
    </div>
  );
}

function SubjectsTable({ items }: { items: SubjectView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Grade level</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3 align-top">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                  {s.code}
                </span>
              </td>
              <td className="px-3 py-3 align-top font-medium">{s.name}</td>
              <td className="px-3 py-3 align-top text-[#64748B] tabular-nums">{s.gradeLevelId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading subjects" className="space-y-3 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  const message =
    error?.kind === "api"
      ? error.code === "AUTH_ACCESS_TOKEN_INVALID"
        ? "Your session has expired — please sign in again."
        : error.message || "Couldn't load subjects. Please try again."
      : error?.kind === "network"
      ? "Network error — check your connection."
      : "Something went wrong. Please try again.";
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">No subjects yet</p>
      <p className="mt-1 text-sm text-[#64748B]">Subjects will appear here once they are configured for your school.</p>
    </div>
  );
}
