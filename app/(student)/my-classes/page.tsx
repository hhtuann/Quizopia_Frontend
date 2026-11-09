"use client";

import Link from "next/link";
import { useState } from "react";
import {
  useAcceptRosterInvitationMutation,
  useJoinedClassroomsQuery,
  useLeaveClassroomMutation,
  useMyRosterInvitationsQuery,
} from "@/hooks/queries/use-classrooms";
import type { JoinedClassroomResponse, RosterEntryResponse } from "@/lib/api/classrooms";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 20;

/**
 * CLASS-M1 (issue #50): the learner's joined classes. Source of truth is the
 * JOINED MEMBERSHIP endpoint (classroom_members) — every enrollment source
 * (teacher direct add, verified-email reconciliation, accepted invitation)
 * shows up exactly once. Pending invitations stay a separate consent
 * section; leaving records a standing opt-out, so a class never re-adds the
 * learner without their explicit accept.
 */
export default function MyClassesPage() {
  const [page, setPage] = useState(0);
  const { data, isPending, isError } = useJoinedClassroomsQuery(page, PAGE_SIZE);
  const { data: invitations } = useMyRosterInvitationsQuery();
  const leave = useLeaveClassroomMutation();
  const accept = useAcceptRosterInvitationMutation();

  // Render-phase page clamp (React-sanctioned setState-during-render, BEFORE
  // any early return): leaving the last card of the last page shrinks
  // totalPages — adjust immediately so the list never strands on an empty
  // over-paged view.
  const totalPages = data?.totalPages ?? 1;
  const lastPage = Math.max(0, totalPages - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }

  if (isPending) return <p className="text-sm text-[#64748B]">Loading your classes…</p>;
  if (isError) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Could not load your classes. Please try again.
      </p>
    );
  }

  const classes: JoinedClassroomResponse[] = data?.items ?? [];
  const pending: RosterEntryResponse[] = invitations ?? [];
  const leaveError = leave.isError;


  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">My classes</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Classes you are a member of — however you joined. You can leave at any time; rejoining a
          class you left always requires your explicit accept.
        </p>
      </header>

      {leaveError && (
        <p className="text-sm text-red-600" role="alert" data-testid="leave-error">
          Could not leave the class. It may already be removed — refresh to update your list.
        </p>
      )}

      {pending.length > 0 && (
        <section aria-label="Pending invitations">
          <h2 className="text-lg font-semibold">Invitations waiting for you</h2>
          <ul className="mt-3 space-y-3">
            {pending.map((entry: RosterEntryResponse) => (
              <li
                key={entry.id}
                className={cn(cardVariants(), "flex items-center justify-between p-4")}
              >
                <div>
                  <p className="font-medium">
                    {entry.classroomName ?? `Class #${entry.classroomId}`}
                  </p>
                  <p className="mt-0.5 text-xs text-[#64748B]">
                    {entry.teacherDisplayName ? `Teacher: ${entry.teacherDisplayName} · ` : ""}
                    invited{" "}
                    {entry.createdAt
                      ? new Date(entry.createdAt).toLocaleDateString("en-GB")
                      : "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate(entry.id)}
                >
                  Join class
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {classes.length === 0 && pending.length === 0 && page === 0 && (
        <div className={cn(cardVariants(), "p-6 text-sm text-[#64748B]")}>
          You have not joined any class yet. When a teacher adds you or invites your email, the
          class appears here.
        </div>
      )}

      <ul className="space-y-3">
        {classes.map((c: JoinedClassroomResponse) => (
          <li
            key={c.classroomId}
            className={cn(cardVariants(), "relative flex items-center justify-between p-4")}
          >
            <div className="min-w-0">
              <Link
                href={`/my-classes/${c.classroomId}`}
                className="font-medium text-[#0F172A] outline-none after:absolute after:inset-0 after:content-[''] hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
              >
                {c.name}
              </Link>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Teacher: {c.teacherDisplayName} · joined{" "}
                {new Date(c.joinedAt).toLocaleDateString("en-GB")}
              </p>
              {c.description && (
                <p className="mt-1 text-xs text-[#64748B]">{c.description}</p>
              )}
            </div>
            <div className="relative z-10 flex items-center gap-3">
              <Badge variant={c.status === "ACTIVE" ? "success" : "default"}>{c.status}</Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={leave.isPending}
                onClick={() => {
                  if (window.confirm(`Leave "${c.name}"? You will lose access to its restricted sessions until you rejoin.`)) {
                    leave.mutate(c.classroomId);
                  }
                }}
              >
                Leave class
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Class pages">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
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
    </div>
  );
}
