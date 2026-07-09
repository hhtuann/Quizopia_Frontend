"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAssignClassesMutation, useSessionClassesQuery } from "@/hooks/queries/use-exam-sessions";
import { useMyClassroomsQuery } from "@/hooks/queries/use-classrooms";
import { Badge, Button, SectionLabel, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { SessionVisibility } from "@/lib/api/exam-sessions";

/**
 * Session visibility + class assignment (FE-CLASSES-2). Replaces the old
 * per-participant ParticipantsManager with class-based access:
 *  - PUBLIC → a static "all school students" badge (no management).
 *  - CLASS_RESTRICTED → the assigned classes (GET .../classes) + a "Manage
 *    classes" modal that PUTs the full new set (replace semantics).
 */
export function ClassAssignment({
  sessionId,
  visibility,
}: {
  sessionId: number;
  visibility: SessionVisibility | null;
}) {
  const isPublic = visibility === "PUBLIC";
  const { data: classesData, isPending: classesPending } = useSessionClassesQuery(sessionId);
  const assigned = classesData?.items ?? [];
  const [manageOpen, setManageOpen] = useState(false);

  if (isPublic) {
    return (
      <div className={cn(cardVariants(), "mb-6 p-6")}>
        <SectionLabel className="mb-3">Visibility</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="accent">Public</Badge>
          <p className="text-sm font-medium text-[#64748B]">
            All students in your school can see and attempt this session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn(cardVariants(), "mb-6 p-6")}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel className="mb-2">Class access</SectionLabel>
            <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">Assigned classes</h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Only students in these classes can see this session.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={classesPending}
            onClick={() => setManageOpen(true)}
          >
            {classesPending ? "Loading…" : "Manage classes"}
          </Button>
        </div>
        {assigned.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-sm text-[#64748B]">
            No classes assigned — students won&apos;t see this session until you assign at least one class.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assigned.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-1.5 text-sm"
              >
                <span className="font-mono text-xs text-[#64748B]">{c.code}</span>
                <span className="font-medium text-[#0F172A]">{c.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {manageOpen && (
        <ManageClassesModal
          sessionId={sessionId}
          initialIds={assigned.map((c) => c.id)}
          onClose={() => setManageOpen(false)}
        />
      )}
    </>
  );
}

function ManageClassesModal({
  sessionId,
  initialIds,
  onClose,
}: {
  sessionId: number;
  initialIds: number[];
  onClose: () => void;
}) {
  const { data: classroomsData } = useMyClassroomsQuery();
  const classrooms = classroomsData?.items ?? [];
  const assignMut = useAssignClassesMutation(sessionId);
  // Lazy init from the currently-assigned set; the modal remounts on each open,
  // so toggles are always relative to the latest server state.
  const [selected, setSelected] = useState<number[]>(() => initialIds);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onSave = async () => {
    setError(null);
    try {
      await assignMut.mutateAsync(selected);
      onClose();
    } catch {
      setError("Could not save class assignments. Please try again.");
    }
  };

  return (
    <ModalShell title="Manage classes" onClose={onClose}>
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">
          {error}
        </div>
      )}
      {classrooms.length === 0 ? (
        <p className="text-sm text-[#64748B]">
          You have no classes yet. Create one on the Classes page first.
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {classrooms.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm outline-none transition-all duration-200 focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2",
                  checked ? "border-[#0052FF] bg-[#0052FF]/5" : "border-[#E2E8F0] bg-white hover:bg-[#F1F5F9]"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 accent-[#0052FF]"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-[#0F172A]">{c.name}</span>
                  <span className="block text-xs text-[#64748B]">{c.code} · {c.memberCount} members</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-[#64748B]">
        Saving replaces the assigned set — uncheck all to clear the assignment.
      </p>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </button>
        <Button type="button" onClick={onSave} disabled={assignMut.isPending}>
          {assignMut.isPending ? "Saving…" : "Save assignments"}
        </Button>
      </div>
    </ModalShell>
  );
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
      <div className={cn(cardVariants({ variant: "elevated" }), "relative w-full max-w-lg p-6")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] outline-none transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
