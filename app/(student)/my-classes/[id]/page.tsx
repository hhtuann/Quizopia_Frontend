"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useJoinedClassroomQuery, useJoinedClassroomSessionsQuery } from "@/hooks/queries/use-classrooms";
import type { LearnerClassroomSessionItem } from "@/lib/api/classrooms";
import { MyResultsSection } from "@/components/student/MyResultsSection";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

/**
 * CLASS-M2 (#52) / CLASS-M3 (#54): the learner's joined-classroom detail —
 * overview (name, code, teacher, joined date, assigned-session count) and the
 * assigned SCHEDULED/OPEN/CLOSED(/CANCELLED) sessions with server-authorized
 * Start/Resume/Result handled by the existing `/sessions/{sessionId}`
 * landing route (this page never decides eligibility itself). DRAFT sessions
 * never reach the learner (server projection). CLASS-M3 adds the "My
 * results" tab (`?tab=results`): per-session result summaries deep-linked to
 * the existing `/attempts/{bestAttemptId}/result` page.
 */

const PAGE_SIZE = 20;

function sessionStatusVariant(status: LearnerClassroomSessionItem["status"]): "accent" | "success" | "default" | "destructive" {
  switch (status) {
    case "OPEN":
      return "success";
    case "SCHEDULED":
      return "accent";
    case "CANCELLED":
      return "destructive";
    default:
      return "default";
  }
}

function formatWindow(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  return `${fmt(startsAt)} → ${fmt(endsAt)}`;
}

type ClassTab = "overview" | "results";

function parseTab(raw: string | null): ClassTab {
  return raw === "results" ? "results" : "overview";
}

export default function MyClassDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading class…</p>}>
      <MyClassDetailPageInner />
    </Suspense>
  );
}

function MyClassDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const idNum = Number(id);
  const valid = Number.isFinite(idNum) && idNum > 0;
  const tab = parseTab(searchParams.get("tab"));

  const { data, isPending, isError, error } = useJoinedClassroomQuery(valid ? idNum : 0, valid);

  if (!valid) return <ClassNotFound />;
  if (isPending) return <p className="text-sm text-[#64748B]">Loading class…</p>;
  if (isError) {
    const norm = error as unknown as NormalizedApiError | undefined;
    // Non-member / left / removed / unknown class all surface as 404.
    if (norm?.kind === "api" && norm.code === "CLASSROOM_NOT_FOUND") return <ClassNotFound />;
    return (
      <p className="text-sm text-red-600" role="alert">
        Could not load this class. Please try again.
      </p>
    );
  }
  if (!data) return <ClassNotFound />;

  const setTab = (next: ClassTab) => {
    router.replace(`?tab=${next}`, { scroll: false });
  };

  const tabs: readonly { id: ClassTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "results", label: "My Results" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/my-classes"
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          My classes
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">{data.name}</h1>
          <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[#64748B]">
            {data.code}
          </span>
          <Badge variant={data.status === "ACTIVE" ? "success" : "default"}>{data.status}</Badge>
        </div>
        {data.description ? (
          <p className="mt-2 max-w-2xl text-sm font-medium text-[#64748B]">{data.description}</p>
        ) : null}
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Teacher: <span className="font-semibold text-[#0F172A]">{data.teacherDisplayName}</span> ·
          joined {new Date(data.joinedAt).toLocaleDateString("en-GB")} ·{" "}
          {`${data.assignedSessionCount} assigned session${data.assignedSessionCount === 1 ? "" : "s"}`}
        </p>
      </header>

      <div
        className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-1"
        role="tablist"
        aria-label="Class sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF]",
              tab === t.id
                ? "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                : "text-[#64748B] hover:bg-white hover:text-[#0F172A]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <AssignedSessions classId={data.classroomId} />
      ) : (
        <MyResultsSection classId={data.classroomId} />
      )}
    </div>
  );
}

function AssignedSessions({ classId }: { classId: number }) {
  const [page, setPage] = useState(0);
  const { data, isPending, isError } = useJoinedClassroomSessionsQuery(classId, {
    page,
    size: PAGE_SIZE,
  });

  const totalPages = data?.totalPages ?? 1;
  const items = data?.items ?? [];
  // Render-phase clamp (same as M1 my-classes): never strand on an empty
  // over-paged view when the list shrinks (leave/unassign refetch).
  const lastPage = Math.max(0, totalPages - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }

  return (
    <section aria-label="Assigned sessions">
      <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">Assigned sessions</h2>
      {isPending ? (
        <p className="mt-3 text-sm text-[#64748B]">Loading sessions…</p>
      ) : isError ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          Could not load sessions. Please try again.
        </p>
      ) : items.length === 0 ? (
        <div className={cn(cardVariants(), "mt-3 p-6 text-sm text-[#64748B]")}>
          No sessions assigned to this class yet.
        </div>
      ) : (
        <>
          <ul className="mt-3 adaptive-grid">
            {items.map((s: LearnerClassroomSessionItem) => (
              <li
                key={s.sessionId}
                className={cn(cardVariants(), "flex flex-wrap items-center justify-between gap-3 p-4")}
              >
                <div className="min-w-0">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-[#64748B]">
                    {s.examTitle} · {formatWindow(s.startsAt, s.endsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sessionStatusVariant(s.status)}>{s.status}</Badge>
                  {/* The landing route runs the server pre-flight: start /
                      resume / own-result decisions stay server-authorized. */}
                  <Link
                    href={`/sessions/${s.sessionId}`}
                    className="text-xs font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                  >
                    {s.status === "CLOSED" || s.status === "CANCELLED" ? "View result" : "Open"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between" aria-label="Session pages">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <p className="text-xs text-[#64748B]">
                Page {page + 1} of {totalPages}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function ClassNotFound() {
  return (
    <div className={cn(cardVariants(), "p-6 text-sm text-[#64748B]")}>
      <p className="font-medium text-[#0F172A]">Class not available</p>
      <p className="mt-1">
        You are not a member of this class (or you left it).{" "}
        <Link href="/my-classes" className="font-semibold text-[#0052FF] hover:underline">
          Back to my classes
        </Link>
        .
      </p>
    </div>
  );
}
