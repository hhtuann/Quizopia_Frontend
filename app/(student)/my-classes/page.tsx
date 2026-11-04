"use client";

import { useDeclineRosterEntryMutation, useMyRosterEntriesQuery } from "@/hooks/queries/use-classrooms";
import type { RosterEntryResponse } from "@/lib/api/classrooms";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Identity-M3 learner view: classes joined through verified-email
 * reconciliation. A learner may DECLINE any linked entry, which removes the
 * classroom membership immediately (the roster entry is kept for audit).
 */
export default function MyClassesPage() {
  const { data, isPending, isError } = useMyRosterEntriesQuery();
  const decline = useDeclineRosterEntryMutation();

  if (isPending) return <p className="text-sm text-[#64748B]">Loading your classes…</p>;
  if (isError) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Could not load your classes. Please try again.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">My classes</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Classes you joined by verifying your email. You can leave a class at any time.
        </p>
      </header>

      {(!data || data.length === 0) && (
        <div className={cn(cardVariants(), "p-6 text-sm text-[#64748B]")}>
          You have not joined any class yet. When a teacher invites your email and you verify
          it, the class appears here.
        </div>
      )}

      <ul className="space-y-3">
        {data?.map((entry: RosterEntryResponse) => (
          <li key={entry.id} className={cn(cardVariants(), "flex items-center justify-between p-4")}>
            <div>
              <p className="font-medium">{entry.fullName}</p>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Class #{entry.classroomId} · joined {entry.linkedAt
                  ? new Date(entry.linkedAt).toLocaleDateString("en-GB")
                  : "—"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={entry.status === "LINKED" ? "success" : "default"}>
                {entry.status}
              </Badge>
              {entry.status === "LINKED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={decline.isPending}
                  onClick={() => {
                    if (window.confirm("Leave this class? Your membership will be removed.")) {
                      decline.mutate(entry.id);
                    }
                  }}
                >
                  Leave class
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
