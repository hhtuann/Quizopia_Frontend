"use client";

import { useState } from "react";
import Link from "next/link";
import { useMyResultsQuery } from "@/hooks/queries/use-classrooms";
import type { ClassroomSessionStatus, LearnerMyResultsItem } from "@/lib/api/classrooms";
import {
  GradebookStatusChip,
  formatScore,
} from "@/components/teacher/gradebook/gradebook-status";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

/**
 * CLASS-M3 (#54): the learner's "My Results" tab on a joined-class detail —
 * one card per session with the same result-status color semantics as the
 * teacher gradebook. "View result" deep-links to the existing
 * `/attempts/{bestAttemptId}/result` page and appears only for SCORED
 * sessions (the route owns any further authorization).
 */

const PAGE_SIZE = 20;

function sessionStatusVariant(
  status: ClassroomSessionStatus
): "accent" | "success" | "default" | "destructive" {
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

function resultChip(r: LearnerMyResultsItem): React.ReactNode {
  if (r.resultStatus === "SCORED") {
    return (
      <GradebookStatusChip status="SCORED">
        {formatScore(r.score, r.maxScore, r.percentage)}
      </GradebookStatusChip>
    );
  }
  return <GradebookStatusChip status={r.resultStatus} />;
}

export function MyResultsSection({ classId }: { classId: number }) {
  const [page, setPage] = useState(0);
  const { data, isPending, isError, error } = useMyResultsQuery(classId, {
    page,
    size: PAGE_SIZE,
  });

  const totalPages = data?.totalPages ?? 1;
  const items = data?.items ?? [];
  // Render-phase clamp (same as the M1/M2 lists): never strand on an empty
  // over-paged view when the result set shrinks.
  const lastPage = Math.max(0, totalPages - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }

  const norm = error as unknown as NormalizedApiError | undefined;
  const notFound = isError && norm?.kind === "api" && norm.code === "CLASSROOM_NOT_FOUND";

  return (
    <section aria-label="My results">
      <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">My results</h2>
      {isPending ? (
        <p className="mt-3 text-sm text-[#64748B]">Loading results…</p>
      ) : notFound ? (
        <div className={cn(cardVariants(), "mt-3 p-6 text-sm text-[#64748B]")}>
          <p className="font-medium text-[#0F172A]">Class not available</p>
          <p className="mt-1">
            You are not a member of this class (or you left it).{" "}
            <Link href="/my-classes" className="font-semibold text-[#0052FF] hover:underline">
              Back to my classes
            </Link>
            .
          </p>
        </div>
      ) : isError ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          Could not load your results. Please try again.
        </p>
      ) : items.length === 0 ? (
        <div className={cn(cardVariants(), "mt-3 p-6 text-sm text-[#64748B]")}>
          No results yet — sessions will appear here once your teacher opens them.
        </div>
      ) : (
        <>
          <ul className="mt-3 adaptive-grid">
            {items.map((r) => (
              <li
                key={r.sessionId}
                className={cn(cardVariants(), "flex flex-wrap items-center justify-between gap-3 p-4")}
              >
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  <p className="mt-0.5 text-xs text-[#64748B]">
                    {r.examTitle} · {formatWindow(r.startsAt, r.endsAt)}
                    {r.attemptCount != null && r.attemptCount > 0
                      ? ` · ${r.attemptCount} attempt${r.attemptCount === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={sessionStatusVariant(r.status)}>{r.status}</Badge>
                  {resultChip(r)}
                  {r.resultStatus === "SCORED" && r.bestAttemptId != null && (
                    <Link
                      href={`/attempts/${r.bestAttemptId}/result`}
                      className="text-xs font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                    >
                      View result
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between" aria-label="Result pages">
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
