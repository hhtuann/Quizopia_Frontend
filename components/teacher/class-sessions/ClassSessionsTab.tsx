"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  useAssignableSessionsQuery,
  useAssignSessionMutation,
  useClassroomSessionsQuery,
  useUnassignSessionMutation,
} from "@/hooks/queries/use-classrooms";
import type {
  AssignableSessionItem,
  ClassroomSessionItem,
  ClassroomSessionStatus,
} from "@/lib/api/classrooms";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { Badge, Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

/**
 * CLASS-M2 (#52): the Sessions section of the teacher class page. Lists
 * sessions assigned to THIS classroom (all lifecycle states, deep-linked to
 * the canonical exam session editor), and offers an additive
 * "Assign session" picker over the caller's own eligible sessions — never a
 * replace of the whole class set. Unassignment is confirm-gated and only
 * offered while the session is still DRAFT/SCHEDULED (server lifecycle rule).
 */

const STATUS_OPTIONS: readonly { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Open", value: "OPEN" },
  { label: "Closed", value: "CLOSED" },
  { label: "Cancelled", value: "CANCELLED" },
];

function statusVariant(status: ClassroomSessionStatus): "default" | "accent" | "success" | "warn" | "destructive" {
  switch (status) {
    case "OPEN":
      return "success";
    case "SCHEDULED":
      return "accent";
    case "CLOSED":
      return "default";
    case "CANCELLED":
      return "destructive";
    default:
      return "warn";
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

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={cn(cardVariants({ variant: "elevated" }), "relative max-h-[85vh] w-full max-w-lg overflow-y-auto p-6")}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[#64748B] outline-none transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function ClassSessionsTab({
  classId,
  isArchived = false,
  onNotice,
}: {
  classId: number;
  isArchived?: boolean;
  onNotice: (notice: { kind: "success" | "error"; message: string }) => void;
}) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<ClassroomSessionItem | null>(null);

  const { data, isPending, isError } = useClassroomSessionsQuery(classId, {
    page,
    size: 10,
    status: status || undefined,
    search: search || undefined,
  });
  const assign = useAssignSessionMutation(classId);
  const unassign = useUnassignSessionMutation(classId);

  const totalPages = data?.totalPages ?? 1;
  const items = data?.items ?? [];

  // Render-phase clamp (same as M1 my-classes): removing the last row of
  // the last page shrinks totalPages — settle immediately instead of
  // stranding on an empty over-paged view that renders a false empty state.
  const lastPage = Math.max(0, totalPages - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }

  const handleAssignError = (err: unknown, what: string) => {
    const norm = err as NormalizedApiError | undefined;
    const msg =
      norm?.kind === "api" && norm.code === "EXAM_SESSION_INVALID_STATE"
        ? `${what}: the session is no longer in an assignable state (refresh the list).`
        : norm?.kind === "network"
          ? "Network error — check your connection."
          : `Could not ${what.toLowerCase()}. Please try again.`;
    onNotice({ kind: "error", message: msg });
  };

  return (
    <section aria-label="Class sessions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value || "all"}
              type="button"
              aria-pressed={status === opt.value}
              onClick={() => {
                setStatus(opt.value);
                setPage(0);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
                status === opt.value
                  ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white"
                  : "bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(0);
            }}
          >
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search sessions…"
              aria-label="Search assigned sessions"
              className="h-9 w-44"
            />
          </form>
          {!isArchived && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              Assign session
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="mt-6 text-sm text-[#64748B]">Loading sessions…</p>
      ) : isError ? (
        <p className="mt-6 text-sm text-red-600" role="alert">
          Could not load sessions. Please try again.
        </p>
      ) : items.length === 0 ? (
        <div className={cn(cardVariants(), "mt-6 p-6 text-sm text-[#64748B]")}>
          {status || search ? (
            <>No sessions match this filter.</>
          ) : isArchived ? (
            <>No sessions were assigned to this archived class.</>
          ) : (
            <>
              No sessions assigned to this class yet. Use{" "}
              <span className="font-semibold text-[#0F172A]">Assign session</span> to add one of your
              existing exam sessions.
            </>
          )}
        </div>
      ) : (
        <div className={cn(cardVariants(), "mt-6 overflow-x-auto p-4 sm:p-6")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
                <th className="px-3 py-3 text-left">Session</th>
                <th className="px-3 py-3 text-left">Exam</th>
                <th className="px-3 py-3 text-left">Window</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.sessionId} className="relative border-b border-[#E2E8F0]/60 last:border-0">
                  <td className="px-3 py-3">
                    <Link
                      href={`/exams/${s.examId}/sessions/${s.sessionId}`}
                      className="font-semibold text-[#0F172A] outline-none after:absolute after:inset-0 after:content-[''] hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                    >
                      {s.title}
                    </Link>
                    <span className="ml-2 rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs text-[#64748B]">
                      {s.code}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[#64748B]">{s.examTitle}</td>
                  <td className="px-3 py-3 text-[#64748B]">{formatWindow(s.startsAt, s.endsAt)}</td>
                  <td className="px-3 py-3 text-center">
                    <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                  </td>
                  <td className="relative z-10 px-3 py-3 text-right">
                    {!isArchived && (s.status === "DRAFT" || s.status === "SCHEDULED") ? (
                      <button
                        type="button"
                        onClick={() => setRemoving(s)}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-9 border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444]/5"
                        )}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="text-xs text-[#64748B]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        </div>
      )}

      {pickerOpen && (
        <AssignPickerModal
          classId={classId}
          busy={assign.isPending}
          onClose={() => setPickerOpen(false)}
          onAssign={(s) =>
            assign.mutate(s.sessionId, {
              onSuccess: () => {
                // Close the picker so the notice (rendered at page level,
                // below the z-50 overlay) is actually visible.
                setPickerOpen(false);
                onNotice({ kind: "success", message: `Assigned "${s.title}" to this class.` });
              },
              onError: (err) => {
                // Same z-50 rationale as onSuccess: the notice renders at
                // page level, below the open picker — close first.
                setPickerOpen(false);
                handleAssignError(err, "Assign session");
              },
            })
          }
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        titleId="unassign-session-title"
        title="Remove session from class?"
        description={
          removing
            ? `"${removing.title}" stays available to your other classes — only this class's assignment is removed. Learners' past attempts and results are kept.`
            : undefined
        }
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={unassign.isPending}
        onConfirm={() =>
          removing &&
          unassign.mutate(removing.sessionId, {
            onSuccess: () => {
              onNotice({ kind: "success", message: `Removed "${removing.title}" from this class.` });
              setRemoving(null);
            },
            onError: (err) => {
              handleAssignError(err, "Remove session");
              setRemoving(null);
            },
          })
        }
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

function AssignPickerModal({
  classId,
  busy,
  onClose,
  onAssign,
}: {
  classId: number;
  busy: boolean;
  onClose: () => void;
  onAssign: (s: AssignableSessionItem) => void;
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const { data, isPending, isError } = useAssignableSessionsQuery(classId, {
    page,
    size: 10,
    search: search || undefined,
  });
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  // Render-phase clamp: assigning the last picker row of the last page
  // shrinks totalPages — settle instead of showing the false empty state.
  const lastPage = Math.max(0, totalPages - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }

  return (
    <ModalShell title="Assign an existing session" onClose={onClose}>
      <p className="text-sm font-medium text-[#64748B]">
        Your CLASS_RESTRICTED draft/scheduled sessions not yet in this class. Adding is additive — other
        classes are untouched.
      </p>
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
          setPage(0);
        }}
      >
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search your sessions…"
          aria-label="Search assignable sessions"
        />
      </form>
      {isPending ? (
        <p className="mt-4 text-sm text-[#64748B]">Loading your sessions…</p>
      ) : isError ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          Could not load assignable sessions.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-[#64748B]">
          {search
            ? "No sessions match this search."
            : "No eligible sessions to assign — create a CLASS_RESTRICTED session from one of your published exams first (Exam → Sessions → New session)."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Assignable sessions">
          {items.map((s) => (
            <li
              key={s.sessionId}
              className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0F172A]">{s.title}</p>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  <span className="font-mono">{s.code}</span> · {s.examTitle} · {s.status} ·{" "}
                  {formatWindow(s.startsAt, s.endsAt)}
                </p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => onAssign(s)}>
                Assign
              </Button>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Assignable pages">
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
    </ModalShell>
  );
}
