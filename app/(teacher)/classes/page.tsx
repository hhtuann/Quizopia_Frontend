"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateClassroomMutation, useMyClassroomsQuery } from "@/hooks/queries/use-classrooms";
import { Badge, Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { createClassroomSchema, type CreateClassroomValues } from "@/lib/validation/classroom-schemas";
import type { ClassroomResponse, ClassroomStatus } from "@/lib/api/classrooms";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";
const textareaClass =
  "w-full min-h-[80px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

function describeCreateError(err: unknown): { field?: "code"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "CLASSROOM_CODE_CONFLICT":
        return { field: "code", message: "This code is already in use." };
      case "CLASSROOM_ACCESS_DENIED":
        return { message: "You don't have permission to create classes." };
      case "CLASSROOM_TEACHER_PROFILE_NOT_FOUND":
        return { message: "Teacher profile not found for your account." };
      default:
        return { message: norm.message || "Could not create the class." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}

function statusVariant(status: ClassroomStatus): "success" | "default" {
  return status === "ACTIVE" ? "success" : "default";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ClassesPage() {
  const { data, isPending, isError, error } = useMyClassroomsQuery();
  const items = data?.items ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="select-none">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            My Classes
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Manage your classes and student rosters.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create class
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
          <ClassesTable items={items} />
        )}
      </div>

      {createOpen && (
        <CreateClassroomModal
          onClose={() => setCreateOpen(false)}
          onCreated={(msg) => {
            setCreateOpen(false);
            setNotice({ kind: "success", message: msg });
          }}
        />
      )}
    </div>
  );
}

function ClassesTable({ items }: { items: ClassroomResponse[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            <th scope="col" className="px-3 pb-3 font-semibold">Code</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
            <th scope="col" className="px-3 pb-3 text-right font-semibold">Members</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
            <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
              <td className="px-3 py-3 align-top">
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">
                  {c.code}
                </span>
              </td>
              <td className="px-3 py-3 align-top">
                <Link
                  href={`/classes/${c.id}`}
                  className="rounded font-semibold text-[#0F172A] outline-none transition-colors hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                >
                  {c.name}
                </Link>
                {c.description ? (
                  <span className="mt-0.5 block max-w-md truncate text-xs text-[#64748B]">{c.description}</span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-right align-top font-semibold tabular-nums">{c.memberCount}</td>
              <td className="px-3 py-3 align-top">
                <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
              </td>
              <td className="px-3 py-3 align-top text-[#64748B]">{formatDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateClassroomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const createMut = useCreateClassroomMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateClassroomValues>({
    resolver: zodResolver(createClassroomSchema),
    defaultValues: { code: "", name: "", description: "" },
  });

  const onSubmit = async (values: CreateClassroomValues) => {
    setFormError(null);
    try {
      const res = await createMut.mutateAsync({
        code: values.code.trim(),
        name: values.name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      });
      onCreated(`Class "${res.code}" created.`);
    } catch (err) {
      const mapped = describeCreateError(err);
      if (mapped.field === "code") setError("code", { message: mapped.message });
      else setFormError(mapped.message);
    }
  };

  return (
    <ModalShell title="Create class" onClose={onClose}>
      {formError && (
        <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">
          {formError}
        </div>
      )}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="class-code" className={labelClass}>Code</label>
          <Input
            id="class-code"
            type="text"
            placeholder="e.g. 10A-MATH"
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? "class-code-error" : undefined}
            className={cn(errors.code && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("code")}
          />
          <FieldError id="class-code-error" message={errors.code?.message} />
        </div>
        <div>
          <label htmlFor="class-name" className={labelClass}>Name</label>
          <Input
            id="class-name"
            type="text"
            placeholder="Lớp 10A1"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "class-name-error" : undefined}
            className={cn(errors.name && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("name")}
          />
          <FieldError id="class-name-error" message={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="class-description" className={labelClass}>
            Description <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
          </label>
          <textarea
            id="class-description"
            placeholder="Homeroom / subject group"
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "class-description-error" : undefined}
            className={cn(textareaClass, errors.description && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
            {...register("description")}
          />
          <FieldError id="class-description-error" message={errors.description?.message} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create class"}
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
    <div role="status" aria-busy="true" aria-label="Loading classes" className="space-y-3 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  const message =
    error?.kind === "api"
      ? error.code === "CLASSROOM_TEACHER_PROFILE_NOT_FOUND"
        ? "Teacher profile not found for your account."
        : error.code === "CLASSROOM_ACCESS_DENIED"
        ? "You don't have access to classes."
        : error.code === "AUTH_ACCESS_TOKEN_INVALID"
        ? "Your session has expired — please sign in again."
        : error.message || "Couldn't load classes. Please try again."
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">No classes yet</p>
      <p className="mt-1 text-sm text-[#64748B]">Create your first class to start building a roster.</p>
    </div>
  );
}
