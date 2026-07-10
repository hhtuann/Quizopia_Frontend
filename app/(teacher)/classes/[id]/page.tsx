"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useClassroomQuery,
  useRemoveMemberMutation,
  useUpdateClassroomMutation,
} from "@/hooks/queries/use-classrooms";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { StudentSearchSelect } from "@/components/teacher/StudentSearchSelect";
import { Badge, Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { updateClassroomSchema, type UpdateClassroomValues } from "@/lib/validation/classroom-schemas";
import type {
  ClassroomDetailView,
  ClassroomMemberView,
  ClassroomStatus,
} from "@/lib/api/classrooms";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";
const textareaClass =
  "w-full min-h-[80px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

function describeUpdateError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "CLASSROOM_NOT_FOUND":
        return "This class could not be found.";
      case "CLASSROOM_ACCESS_DENIED":
        return "You don't have permission to edit this class.";
      default:
        return norm.message || "Could not save the class.";
    }
  }
  if (norm?.kind === "network") return "Network error — check your connection.";
  return "Something went wrong. Please try again.";
}

function statusVariant(status: ClassroomStatus): "success" | "default" {
  return status === "ACTIVE" ? "success" : "default";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);
  const valid = Number.isFinite(idNum);

  const { data, isPending, isError, error } = useClassroomQuery(valid ? idNum : 0);

  if (!valid) return <NotFound />;
  if (isPending) return <Skeleton />;
  if (isError) {
    const norm = error as unknown as NormalizedApiError | undefined;
    if (norm?.kind === "api" && norm.code === "CLASSROOM_NOT_FOUND") return <NotFound />;
    return <LoadError error={norm} />;
  }
  if (!data) return <NotFound />;
  return <DetailView classroom={data} />;
}

function DetailView({ classroom }: { classroom: ClassroomDetailView }) {
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Auto-dismiss notices after 4 seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div>
      <header className="mb-6">
        <Link
          href="/classes"
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All classes
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">{classroom.name}</h1>
          <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-xs text-[#64748B]">
            {classroom.code}
          </span>
          <Badge variant={statusVariant(classroom.status)}>{classroom.status}</Badge>
        </div>
        {classroom.description ? (
          <p className="mt-2 max-w-2xl text-sm font-medium text-[#64748B]">{classroom.description}</p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm font-medium text-[#64748B]">
            <span className="font-semibold text-[#0F172A] tabular-nums">{classroom.memberCount}</span> member
            {classroom.memberCount === 1 ? "" : "s"} · created {formatDate(classroom.createdAt)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Edit class
          </Button>
        </div>
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

      <StudentSearchSelect
        classId={classroom.id}
        excludeIds={classroom.members.map((m) => m.studentProfileId)}
        onResult={() => { /* inline result shown in StudentSearchSelect */ }}
      />

      <div className={cn(cardVariants(), "mt-6 p-4 sm:p-6")}>
        {classroom.members.length === 0 ? (
          <MembersEmpty />
        ) : (
          <MembersTable classId={classroom.id} members={classroom.members} />
        )}
      </div>

      {editOpen && (
        <EditClassroomModal
          classroom={classroom}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            setNotice({ kind: "success", message: "Class updated." });
          }}
          onError={(msg) => setNotice({ kind: "error", message: msg })}
        />
      )}
    </div>
  );
}

function MembersTable({
  classId,
  members,
}: {
  classId: number;
  members: ClassroomMemberView[];
}) {
  const removeMut = useRemoveMemberMutation(classId);
  const [removeTarget, setRemoveTarget] = useState<{ profileId: number; code: string } | null>(null);

  const onConfirmRemove = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    await removeMut.mutateAsync(target.profileId).catch(() => {
      /* error surfaces via the refetched detail; keep simple for MVP */
    });
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
              <th scope="col" className="px-3 pb-3 font-semibold">Student</th>
              <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
              <th scope="col" className="px-3 pb-3 font-semibold">Added</th>
              <th scope="col" className="px-3 pb-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.studentProfileId} className="border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
                <td className="px-3 py-3 align-top">
                  <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                    {m.studentCode}
                  </span>
                </td>
                <td className="px-3 py-3 align-top font-medium">{m.displayName}</td>
                <td className="px-3 py-3 align-top text-[#64748B]">{formatDate(m.addedAt)}</td>
                <td className="px-3 py-3 text-right align-top">
                  <button
                    type="button"
                    onClick={() => setRemoveTarget({ profileId: m.studentProfileId, code: m.studentCode })}
                    disabled={removeMut.isPending}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 text-[#EF4444] hover:bg-[#EF4444]/5 hover:text-[#EF4444]")}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        titleId="remove-member-title"
        title={`Remove ${removeTarget?.code ?? ""}?`}
        description="The student will no longer be a member of this class. They can be re-added later."
        confirmLabel="Remove"
        cancelLabel="Keep"
        busyLabel="Removing…"
        busy={removeMut.isPending}
        onConfirm={onConfirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}

function EditClassroomModal({
  classroom,
  onClose,
  onSaved,
  onError,
}: {
  classroom: ClassroomDetailView;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const updateMut = useUpdateClassroomMutation(classroom.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateClassroomValues>({
    resolver: zodResolver(updateClassroomSchema),
    defaultValues: { name: classroom.name, description: classroom.description ?? "" },
  });

  const onSubmit = async (values: UpdateClassroomValues) => {
    try {
      await updateMut.mutateAsync({
        name: values.name?.trim() ? values.name.trim() : null,
        description: values.description?.trim() ? values.description.trim() : null,
      });
      onSaved();
    } catch (err) {
      onError(describeUpdateError(err));
      onClose();
    }
  };

  return (
    <ModalShell title={`Edit ${classroom.code}`} onClose={onClose}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-class-name" className={labelClass}>Name</label>
          <Input
            id="edit-class-name"
            type="text"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "edit-class-name-error" : undefined}
            className={cn(errors.name && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("name")}
          />
        </div>
        <div>
          <label htmlFor="edit-class-description" className={labelClass}>
            Description <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <textarea
            id="edit-class-description"
            placeholder="Homeroom / subject group"
            className={cn(textareaClass, errors.description && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("description")}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
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

function MembersEmpty() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="font-display text-base font-bold text-[#0F172A]">No students yet</p>
      <p className="mt-1 text-sm text-[#64748B]">Add students by their profile IDs above.</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading class" className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-[#F1F5F9]" />
      <div className="h-40 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">Class not found</p>
      <p className="mt-1 text-sm text-[#64748B]">This class may have been removed or you don&apos;t have access.</p>
      <Link href="/classes" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
        Back to classes
      </Link>
    </div>
  );
}

function LoadError({ error }: { error: NormalizedApiError | undefined }) {
  const message =
    error?.kind === "api"
      ? error.code === "AUTH_ACCESS_TOKEN_INVALID"
        ? "Your session has expired — please sign in again."
        : error.message || "Couldn't load this class."
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
