"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAssignSchoolMutation, usePendingStudentsQuery } from "@/hooks/queries/use-student-onboarding";
import { useSchoolsQuery } from "@/hooks/queries/use-schools";import { RequireAuth } from "@/components/auth/RequireAuth";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { Button, Input, SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { PendingStudentItem } from "@/lib/api/student-onboarding";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 20;
const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function describeAssignError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "ACADEMIC_STUDENT_ALREADY_ASSIGNED":
        return "This student is already assigned to a school.";
      case "ACADEMIC_STUDENT_NOT_FOUND":
        return "Student not found.";
      case "ACADEMIC_SCHOOL_NOT_FOUND":
        return "School not found.";
      case "ACADEMIC_ACCESS_DENIED":
        return "You don't have permission to assign students.";
      default:
        return norm.message || "Could not assign the student.";
    }
  }
  if (norm?.kind === "network") return "Network error — check your connection.";
  return "Something went wrong. Please try again.";
}

export default function PendingStudentsPage() {
  return (
    <RequireAuth requireRole="ACADEMIC_ADMIN">
      <PendingStudentsList />
    </RequireAuth>
  );
}

function PendingStudentsList() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [assignTarget, setAssignTarget] = useState<PendingStudentItem | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const assignMut = useAssignSchoolMutation();
  // Auto-select the caller's school (ACADEMIC_ADMIN sees exactly 1). Real ID, not hardcoded.
  const { data: schoolsData } = useSchoolsQuery();
  const schools = schoolsData?.items ?? [];
  const [schoolId, setSchoolId] = useState<number | null>(null);
  // Render-phase resync (avoids react-hooks/set-state-in-effect).
  if (schoolId === null && schools.length > 0) setSchoolId(schools[0].id);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const params = useMemo(
    () => ({ page, size: PAGE_SIZE, search: search || undefined }),
    [page, search]
  );

  const { data, isPending, isError, error } = usePendingStudentsQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  const onConfirmAssign = async () => {
    if (!assignTarget) return;
    const target = assignTarget;
    setAssignTarget(null);
    setNotice(null);
    try {
      const res = await assignMut.mutateAsync({ userId: target.userId, schoolId: schoolId ?? schools[0]?.id ?? 1 });
      setNotice({
        kind: "success",
        message: `"${target.displayName}" assigned. Student code: ${res.studentCode}.`,
      });
    } catch (err) {
      setNotice({ kind: "error", message: describeAssignError(err) });
    }
  };

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
        <SectionLabel className="mb-3 mt-3">Onboarding</SectionLabel>
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Pending Students
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Students awaiting school assignment. Assign to generate their student code.
        </p>
      </header>

      {notice && (
        <div
          role={notice.kind === "success" ? "status" : "alert"}
          className={cn(
            "mb-6 flex items-start gap-2 rounded-lg border p-4 text-sm font-medium",
            notice.kind === "success"
              ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
              : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
          )}
        >
          <span>{notice.message}</span>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="pending-search" className="sr-only">Search pending students</label>
        <Input
          id="pending-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name, username, or email…"
          className="h-11"
        />
      </div>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <PendingTable items={items} onAssign={setAssignTarget} />
        )}

        {!isPending && !isError && items.length > 0 && (
          <div className="mt-4 flex items-center justify-between px-1 pt-4">
            <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
              {totalElements} student{totalElements === 1 ? "" : "s"} · Page {page + 1} of {Math.max(totalPages, 1)}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 0} aria-label="Previous page" className={pageBtnClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} aria-label="Next page" className={pageBtnClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={assignTarget !== null}
        titleId="assign-school-title"
        title={`Assign ${assignTarget?.displayName ?? ""} to school?`}
        description="A student code will be auto-generated. The student will then be able to see and attempt exam sessions."
        confirmLabel="Assign"
        cancelLabel="Cancel"
        busyLabel="Assigning…"
        busy={assignMut.isPending}
        onConfirm={onConfirmAssign}
        onCancel={() => setAssignTarget(null)}
      />
    </div>
  );
}

function PendingTable({
  items,
  onAssign,
}: {
  items: PendingStudentItem[];
  onAssign: (s: PendingStudentItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Username</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Email</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Registered</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.userId} className="border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3 align-top">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                  {s.username}
                </span>
              </td>
              <td className="px-3 py-3 align-top font-medium">{s.displayName}</td>
              <td className="px-3 py-3 align-top text-[#64748B]">{s.email}</td>
              <td className="px-3 py-3 align-top text-[#64748B]">{formatDate(s.registeredAt)}</td>
              <td className="px-3 py-3 text-right align-top">
                <Button type="button" size="sm" onClick={() => onAssign(s)}>
                  Assign
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading pending students" className="space-y-3 py-2">
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
        : error.code === "ACADEMIC_ACCESS_DENIED"
        ? "You don't have access to pending students."
        : error.message || "Couldn't load pending students."
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

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">
        {search ? "No matching students" : "No pending students"}
      </p>
      <p className="mt-1 text-sm text-[#64748B]">
        {search ? `No students match "${search}".` : "All registered students have been assigned."}
      </p>
    </div>
  );
}
