"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBlockMutation,
  useParticipantsQuery,
  useUnblockMutation,
} from "@/hooks/queries/use-exam-session-participants";
import { Badge, SectionLabel, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type {
  ExamSessionParticipantResponse,
  ParticipantStatus,
} from "@/lib/api/exam-session-participants";
import type { ExamSessionStatus } from "@/lib/api/exam-sessions";
import type { NormalizedApiError } from "@/lib/api";
import { AddParticipantsForm } from "./AddParticipantsForm";

const PAGE_SIZE = 10;
const ADD_STATES: ExamSessionStatus[] = ["DRAFT", "SCHEDULED"];
const MANAGE_STATES: ExamSessionStatus[] = ["DRAFT", "SCHEDULED", "OPEN"];
const STATUS_OPTIONS: ParticipantStatus[] = ["ELIGIBLE", "BLOCKED"];

const selectClass =
  "h-11 rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";
const pageBtnClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 group hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function describeActionError(err: unknown): { conflict?: boolean; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_SESSION_INVALID_STATE":
        return { conflict: true, message: "That action isn't valid in the current session state." };
      case "EXAM_PARTICIPANT_NOT_FOUND":
        return { message: "This participant could not be found." };
      case "EXAM_SESSION_ACCESS_DENIED":
        return { message: "You don't have permission for this action." };
      default:
        return { message: norm.message || "Action failed. Please try again." };
    }
  }
  if (norm?.kind === "network") return { message: "Network error — check your connection." };
  return { message: "Something went wrong. Please try again." };
}

/**
 * Participants manager for one session. List (status filter + pagination) +
 * per-row block/unblock (state-gated) + bulk-add form (DRAFT/SCHEDULED only).
 */
export function ParticipantsManager({
  sessionId,
  sessionStatus,
}: {
  sessionId: number;
  sessionStatus: ExamSessionStatus;
}) {
  const queryClient = useQueryClient();
  const blockMut = useBlockMutation(sessionId);
  const unblockMut = useUnblockMutation(sessionId);

  const [status, setStatus] = useState<ParticipantStatus | "">("");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<{ kind: "error"; message: string } | null>(null);

  const params = useMemo(
    () => ({ page, size: PAGE_SIZE, status: status || undefined, sort: "addedAt,desc" }),
    [page, status]
  );

  const { data, isPending, isError, error } = useParticipantsQuery(sessionId, params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  const canManage = MANAGE_STATES.includes(sessionStatus);
  const canAdd = ADD_STATES.includes(sessionStatus);

  const runToggle = async (p: ExamSessionParticipantResponse) => {
    setNotice(null);
    const mut = p.status === "ELIGIBLE" ? blockMut : unblockMut;
    try {
      await mut.mutateAsync(p.id);
    } catch (err) {
      const m = describeActionError(err);
      setNotice({ kind: "error", message: m.message });
      if (m.conflict) queryClient.invalidateQueries({ queryKey: ["exam-sessions", sessionId, "detail"] });
    }
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel className="mb-2">Participants</SectionLabel>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">Participants</h2>
        </div>
        <div>
          <label htmlFor="participant-status-filter" className="sr-only">Filter participants by status</label>
          <select
            id="participant-status-filter"
            value={status}
            onChange={(e) => { setStatus(e.target.value as ParticipantStatus | ""); setPage(0); }}
            className={selectClass}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>{notice.message}</span>
        </div>
      )}

      {canAdd && <AddParticipantsForm sessionId={sessionId} />}

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState filtered={!!status} />
        ) : (
          <ParticipantsTable items={items} canManage={canManage} busy={blockMut.isPending || unblockMut.isPending} onToggle={runToggle} />
        )}

        {!isPending && !isError && items.length > 0 && (
          <div className="mt-4 flex items-center justify-between px-1 pt-4">
            <p className="text-xs font-medium text-[#64748B]" aria-live="polite">
              {totalElements} participant{totalElements === 1 ? "" : "s"} · Page {page + 1} of {Math.max(totalPages, 1)}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 0} aria-label="Previous page" className={pageBtnClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} aria-label="Next page" className={pageBtnClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantsTable({
  items,
  canManage,
  busy,
  onToggle,
}: {
  items: ExamSessionParticipantResponse[];
  canManage: boolean;
  busy: boolean;
  onToggle: (p: ExamSessionParticipantResponse) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Student</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Added</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Blocked</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-[#E2E8F0] align-top text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] transition-colors group-hover:text-[#0052FF]">{p.studentCode}</span>
              </td>
              <td className="px-3 py-3 font-medium transition-colors group-hover:text-[#0052FF]">{p.displayName}</td>
              <td className="px-3 py-3">
                <Badge variant={p.status === "ELIGIBLE" ? "success" : "default"} className="gap-1">
                  {p.status === "ELIGIBLE" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  )}
                  {p.status}
                </Badge>
              </td>
              <td className="px-3 py-3 text-[#64748B]">{formatDateTime(p.addedAt)}</td>
              <td className="px-3 py-3 text-[#64748B]">{formatDateTime(p.blockedAt)}</td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onToggle(p)}
                  disabled={!canManage || busy}
                  className={cn(
                    buttonVariants({ variant: p.status === "ELIGIBLE" ? "outline" : "primary", size: "sm" }),
                    "h-9 px-3"
                  )}
                >
                  {p.status === "ELIGIBLE" ? "Block" : "Unblock"}
                </button>
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
    <div role="status" aria-busy="true" aria-label="Loading participants" className="space-y-3 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "EXAM_SESSION_ACCESS_DENIED":
      case "EXAM_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to this session's participants.";
        break;
      case "EXAM_SESSION_NOT_FOUND":
        message = "This session could not be found.";
        break;
      default:
        message = error.message || "Couldn't load participants.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="font-display text-base font-bold text-[#0F172A]">No participants</p>
      <p className="mt-1 text-sm text-[#64748B]">{filtered ? "No participants match this filter." : "Add participants above."}</p>
    </div>
  );
}
