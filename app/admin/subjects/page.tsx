"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { Badge, Button, Input, SectionLabel, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  useCreateSubjectMutation,
  useGradeLevelsQuery,
  useSubjectsQuery,
  useUpdateSubjectMutation,
} from "@/hooks/queries/use-subjects";
import { useSchoolsQuery } from "@/hooks/queries/use-schools";
import {
  updateSubjectStatus,
  type AcademicStatus,
  type GradeLevelView,
  type SubjectView,
} from "@/lib/api/subjects";
import {
  createSubjectSchema,
  updateSubjectSchema,
  type CreateSubjectValues,
  type UpdateSubjectValues,
} from "@/lib/validation/admin-schemas";
import type { NormalizedApiError } from "@/lib/api";

/**
 * MVP single-school demo. The list endpoint (`SubjectView`) carries no school
 * or status, and there is no `GET /api/schools` yet, so the create form scopes
 * to this fixed demo school. Tech debt: revisit once the schools list + a
 * status-bearing subject list DTO exist.
 */
// DEMO_SCHOOL_ID removed — replaced with useSchoolsQuery() auto-select (FE-SCHOOLS).
const STATUS_OPTIONS: AcademicStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";
const textareaClass =
  "w-full min-h-[80px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";
const selectClass =
  "h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";
const statusSelectClass =
  "h-9 rounded-lg border border-[#E2E8F0] bg-transparent px-2 pr-7 text-xs text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

/** Map a subject mutation error to a field or form-level message. */
function describeSubjectError(err: unknown): { field?: "code" | "gradeLevelId"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "ACADEMIC_SUBJECT_CODE_CONFLICT":
        return { field: "code", message: "This code is already in use." };
      case "ACADEMIC_GRADE_LEVEL_NOT_FOUND":
        return { field: "gradeLevelId", message: "Grade level not found in this school." };
      case "ACADEMIC_SCHOOL_NOT_FOUND":
        return { message: "School not found." };
      case "ACADEMIC_SUBJECT_NOT_FOUND":
        return { message: "This subject could not be found." };
      case "ACADEMIC_ACCESS_DENIED":
        return { message: "You don't have permission to manage subjects." };
      default:
        return { message: norm.message || "Could not save the subject." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}

function statusVariant(status: AcademicStatus): "success" | "warn" | "default" {
  if (status === "ACTIVE") return "success";
  if (status === "INACTIVE") return "warn";
  return "default";
}

export default function AdminSubjectsPage() {
  return (
    <RequireAuth requireRole="ACADEMIC_ADMIN">
      <SubjectAdmin />
    </RequireAuth>
  );
}

function SubjectAdmin() {
  const { data, isPending, isError, error } = useSubjectsQuery();
  // Resolve schoolId from the real schools API (replaces hardcoded DEMO_SCHOOL_ID).
  const { data: schoolsData } = useSchoolsQuery();
  const [schoolId, setSchoolId] = useState<number | null>(null);
  // Auto-select the first school (ACADEMIC_ADMIN sees exactly 1). Render-phase resync
  // (avoids react-hooks/set-state-in-effect). No infinite loop: schoolId !== null after.
  if (schoolId === null && schoolsData?.items && schoolsData.items.length > 0) {
    setSchoolId(schoolsData.items[0].id);
  }
  const { data: glData } = useGradeLevelsQuery(schoolId ?? 0);
  const items = data?.items ?? [];
  const gradeLevels = glData?.items ?? [];
  const glMap = useMemo(
    () => new Map((glData?.items ?? []).map((g) => [g.id, g] as const)),
    [glData]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubjectView | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; code: string } | null>(null);
  // The list DTO carries no status; track the real status per row as mutations
  // return SubjectResponse. Defaults to ACTIVE (the entity default).
  const [statusMap, setStatusMap] = useState<Record<number, AcademicStatus>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const statusMut = useMutation({
    mutationFn: (v: { id: number; status: AcademicStatus }) => updateSubjectStatus(v.id, v.status),
    onSuccess: (res) => {
      setStatusMap((m) => ({ ...m, [res.id]: res.status }));
      setNotice({ kind: "success", message: `Subject set to ${res.status.toLowerCase()}.` });
    },
    onError: (err) => setNotice({ kind: "error", message: describeSubjectError(err).message }),
  });

  const currentStatus = (id: number): AcademicStatus => statusMap[id] ?? "ACTIVE";

  const onStatusSelectChange = (subject: SubjectView, next: AcademicStatus) => {
    if (next === currentStatus(subject.id)) return;
    if (next === "ARCHIVED") {
      setArchiveTarget({ id: subject.id, code: subject.code });
      return;
    }
    statusMut.mutate({ id: subject.id, status: next });
  };

  const onConfirmArchive = () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setArchiveTarget(null);
    statusMut.mutate({ id: target.id, status: "ARCHIVED" });
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
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
            Create, edit and manage subjects in your school.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create subject
        </Button>
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

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <SubjectsTable
            items={items}
            glMap={glMap}
            currentStatus={currentStatus}
            busy={statusMut.isPending}
            onEdit={setEditTarget}
            onStatusChange={onStatusSelectChange}
          />
        )}
      </div>

      {createOpen && (
        <CreateSubjectModal
          schoolId={schoolId ?? 0}
          gradeLevels={gradeLevels}
          onClose={() => setCreateOpen(false)}
          onCreated={(msg) => {
            setCreateOpen(false);
            setNotice({ kind: "success", message: msg });
          }}
        />
      )}

      {editTarget && (
        <EditSubjectModal
          subject={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(msg) => {
            setEditTarget(null);
            setNotice({ kind: "success", message: msg });
          }}
        />
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        titleId="archive-subject-title"
        title={`Archive subject ${archiveTarget?.code ?? ""}?`}
        description="Archived subjects are hidden from creation dropdowns. You can reactivate them later."
        confirmLabel="Archive"
        cancelLabel="Keep"
        busyLabel="Archiving…"
        busy={statusMut.isPending}
        onConfirm={onConfirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

function SubjectsTable({
  items,
  glMap,
  currentStatus,
  busy,
  onEdit,
  onStatusChange,
}: {
  items: SubjectView[];
  glMap: Map<number, GradeLevelView>;
  currentStatus: (id: number) => AcademicStatus;
  busy: boolean;
  onEdit: (s: SubjectView) => void;
  onStatusChange: (s: SubjectView, next: AcademicStatus) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Grade level</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => {
            const status = currentStatus(s.id);
            return (
              <tr key={s.id} className="border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
                <td className="px-3 py-3 align-top">
                  <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                    {s.code}
                  </span>
                </td>
                <td className="px-3 py-3 align-top font-medium">{s.name}</td>
                <td className="px-3 py-3 align-top text-[#64748B]">
                  {glMap.get(s.gradeLevelId)?.name ?? `#${s.gradeLevelId}`}
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge variant={statusVariant(status)}>{status}</Badge>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(s)}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}
                    >
                      Edit
                    </button>
                    <label className="sr-only" htmlFor={`subject-status-${s.id}`}>
                      Status for {s.code}
                    </label>
                    <select
                      id={`subject-status-${s.id}`}
                      value={status}
                      disabled={busy}
                      onChange={(e) => onStatusChange(s, e.target.value as AcademicStatus)}
                      className={statusSelectClass}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt.charAt(0) + opt.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Modals
// ============================================================

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
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

function CreateSubjectModal({
  gradeLevels,
  schoolId,
  onClose,
  onCreated,
}: {
  gradeLevels: GradeLevelView[];
  schoolId: number;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const createMut = useCreateSubjectMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateSubjectValues>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: { code: "", name: "", description: "", schoolId, gradeLevelId: NaN },
  });

  const onSubmit = async (values: CreateSubjectValues) => {
    setFormError(null);
    try {
      const res = await createMut.mutateAsync({
        code: values.code.trim(),
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        schoolId,
        gradeLevelId: values.gradeLevelId,
      });
      onCreated(`Subject "${res.code}" created.`);
    } catch (err) {
      const mapped = describeSubjectError(err);
      if (mapped.field === "code") setError("code", { message: mapped.message });
      else if (mapped.field === "gradeLevelId") setError("gradeLevelId", { message: mapped.message });
      else setFormError(mapped.message);
    }
  };

  return (
    <ModalShell title="Create subject" onClose={onClose}>
      {formError && (
        <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">
          {formError}
        </div>
      )}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="subject-code" className={labelClass}>Code</label>
          <Input
            id="subject-code"
            type="text"
            placeholder="e.g. GEN-MATH"
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? "subject-code-error" : undefined}
            className={cn(errors.code && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("code")}
          />
          <FieldError id="subject-code-error" message={errors.code?.message} />
        </div>
        <div>
          <label htmlFor="subject-name" className={labelClass}>Name</label>
          <Input
            id="subject-name"
            type="text"
            placeholder="Toán"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "subject-name-error" : undefined}
            className={cn(errors.name && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("name")}
          />
          <FieldError id="subject-name-error" message={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="subject-description" className={labelClass}>
            Description <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <textarea
            id="subject-description"
            placeholder="What is this subject about?"
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "subject-description-error" : undefined}
            className={cn(textareaClass, errors.description && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("description")}
          />
          <FieldError id="subject-description-error" message={errors.description?.message} />
        </div>
        <div>
          <label htmlFor="subject-grade-level" className={labelClass}>Grade level</label>
          <select
            id="subject-grade-level"
            aria-invalid={!!errors.gradeLevelId}
            aria-describedby={errors.gradeLevelId ? "subject-grade-level-error" : undefined}
            className={cn(selectClass, errors.gradeLevelId && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("gradeLevelId", { valueAsNumber: true })}
          >
            <option value="">Select a grade level…</option>
            {gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.name}
              </option>
            ))}
          </select>
          <FieldError id="subject-grade-level-error" message={errors.gradeLevelId?.message} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create subject"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditSubjectModal({
  subject,
  onClose,
  onSaved,
}: {
  subject: SubjectView;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const updateMut = useUpdateSubjectMutation(subject.id);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSubjectValues>({
    resolver: zodResolver(updateSubjectSchema),
    // The list DTO carries no description (tech debt); prefill name only.
    defaultValues: { name: subject.name, description: "" },
  });

  const onSubmit = async (values: UpdateSubjectValues) => {
    setFormError(null);
    try {
      await updateMut.mutateAsync({
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      });
      onSaved("Subject updated.");
    } catch (err) {
      const mapped = describeSubjectError(err);
      setFormError(mapped.message);
    }
  };

  return (
    <ModalShell title={`Edit ${subject.code}`} onClose={onClose}>
      {formError && (
        <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">
          {formError}
        </div>
      )}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-subject-name" className={labelClass}>Name</label>
          <Input
            id="edit-subject-name"
            type="text"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "edit-subject-name-error" : undefined}
            className={cn(errors.name && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("name")}
          />
          <FieldError id="edit-subject-name-error" message={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="edit-subject-description" className={labelClass}>
            Description <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <textarea
            id="edit-subject-description"
            placeholder="What is this subject about?"
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "edit-subject-description-error" : undefined}
            className={cn(textareaClass, errors.description && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("description")}
          />
          <FieldError id="edit-subject-description-error" message={errors.description?.message} />
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

// ============================================================
// States
// ============================================================

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#EF4444]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      {message}
    </p>
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
      <p className="mt-1 text-sm text-[#64748B]">Create your first subject to get started.</p>
    </div>
  );
}
