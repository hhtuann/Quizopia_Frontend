"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSession, type CreateExamSessionRequest, type SessionVisibility } from "@/lib/api/exam-sessions";
import { useExamsQuery, useExamEditorQuery } from "@/hooks/queries/use-exams";
import { useMyClassroomsQuery } from "@/hooks/queries/use-classrooms";
import { createSessionSchema, type CreateSessionValues } from "@/lib/validation/exam-session-schemas";
import { Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";
const selectClass =
  "h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

function describeCreateError(err: unknown): { field?: "endsAt" | "examVersionNumber"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_CODE_CONFLICT":
        return { message: "This code is already in use. Please retry — codes are auto-generated." };
      case "EXAM_SESSION_TIME_INVALID":
        return { field: "endsAt", message: "End time must be after the start time." };
      case "EXAM_VERSION_NOT_DRAFT":
        return { field: "examVersionNumber", message: "Select a published version." };
      case "EXAM_VERSION_NOT_FOUND":
        return { field: "examVersionNumber", message: "This version could not be found." };
      case "EXAM_NOT_FOUND":
        return { message: "The selected exam could not be found." };
      case "EXAM_SESSION_ACCESS_DENIED":
      case "EXAM_ACCESS_DENIED":
        return { message: "You don't have permission to create an exam session." };
      case "EXAM_VALIDATION_ERROR":
        return { message: norm.message || "Please check the highlighted fields." };
      default:
        return { message: norm.message || "Could not create the session." };
    }
  }
  if (norm?.kind === "network") return { message: "Network error — check your connection and try again." };
  return { message: "Something went wrong. Please try again." };
}

export default function NewExamSessionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: examsData, isPending: examsPending } = useExamsQuery({ size: 100 });
  const exams = examsData?.items ?? [];

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateSessionValues>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: { examId: NaN, examVersionNumber: NaN, title: "", startsAt: "", endsAt: "", maxAttempts: 1, visibility: "CLASS_RESTRICTED" as const },
  });

  const examId = useWatch({ control, name: "examId" });
  const examSelected = Number.isFinite(examId);
  // Reuse the FE7 editor query to read the exam's published versions ONLY.
  const { data: editorData, isPending: editorPending } = useExamEditorQuery(
    examSelected ? examId : 0,
    examSelected
  );
  const publishedVersions = editorData?.publishedVersions ?? [];

  // Visibility + class assignment (FE-CLASSES-2).
  const { data: classroomsData } = useMyClassroomsQuery();
  const classrooms = classroomsData?.items ?? [];
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const visibility: SessionVisibility = useWatch({ control, name: "visibility" }) ?? "CLASS_RESTRICTED";

  const mutation = useMutation({
    mutationFn: (req: CreateExamSessionRequest) => createSession(req),
  });

  const onSubmit = async (values: CreateSessionValues) => {
    setFormError(null);
    if (values.visibility === "CLASS_RESTRICTED" && selectedClassIds.length === 0) {
      setFormError("Select at least one class for a class-restricted session, or choose Public visibility.");
      return;
    }
    const req: CreateExamSessionRequest = {
      examId: values.examId,
      examVersionNumber: values.examVersionNumber,
      title: values.title.trim(),
      // datetime-local (local) → ISO UTC. Runs in the submit handler, not render.
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      maxAttempts: values.maxAttempts,
      visibility: values.visibility,
      classroomIds: values.visibility === "CLASS_RESTRICTED" ? selectedClassIds : [],
    };
    try {
      await mutation.mutateAsync(req);
      await queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
      router.replace("/exam-sessions");
    } catch (err) {
      const mapped = describeCreateError(err);
      if (mapped.field) setError(mapped.field, { message: mapped.message });
      else setFormError(mapped.message);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/exam-sessions" className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All sessions
        </Link>
        <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">Create exam session</h1>
      </div>

      <div className={cn(cardVariants({ variant: "elevated" }), "max-w-2xl p-8 sm:p-10")}>
        {formError && (
          <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>{formError}</span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="session-exam" className={labelClass}>Exam</label>
            <select
              id="session-exam"
              disabled={examsPending}
              aria-invalid={!!errors.examId}
              aria-describedby={errors.examId ? "session-exam-error" : undefined}
              className={cn(selectClass, errors.examId && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]", "disabled:opacity-70")}
              {...register("examId", {
                valueAsNumber: true,
                onChange: () => setValue("examVersionNumber", NaN),
              })}
            >
              <option value="">{examsPending ? "Loading exams…" : "Select an exam…"}</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.hasPublished}>
                  {e.title}{!e.hasPublished ? " (no published version)" : ""}
                </option>
              ))}
            </select>
            <FieldError id="session-exam-error" message={errors.examId?.message} />
          </div>

          <div>
            <label htmlFor="session-version" className={labelClass}>Published version</label>
            <select
              id="session-version"
              disabled={!examSelected || editorPending}
              aria-invalid={!!errors.examVersionNumber}
              aria-describedby={errors.examVersionNumber ? "session-version-error" : undefined}
              className={cn(selectClass, errors.examVersionNumber && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]", "disabled:opacity-70")}
              {...register("examVersionNumber", { valueAsNumber: true })}
            >
              <option value="">
                {!examSelected ? "Select an exam first" : editorPending ? "Loading versions…" : publishedVersions.length === 0 ? "No published versions" : "Select a version…"}
              </option>
              {publishedVersions.map((v) => (
                <option key={v.versionNumber} value={v.versionNumber}>
                  v{v.versionNumber} ({v.totalPoints} pts)
                </option>
              ))}
            </select>
            <FieldError id="session-version-error" message={errors.examVersionNumber?.message} />
          </div>

          <div>
            <label htmlFor="session-maxAttempts" className={labelClass}>Max attempts</label>
            <Input id="session-maxAttempts" type="number" min={1} step={1} aria-invalid={!!errors.maxAttempts} aria-describedby={errors.maxAttempts ? "session-maxAttempts-error" : undefined} className={cn(errors.maxAttempts && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("maxAttempts", { valueAsNumber: true })} />
            <FieldError id="session-maxAttempts-error" message={errors.maxAttempts?.message} />
          </div>

          <div>
            <label htmlFor="session-title" className={labelClass}>Title</label>
            <Input id="session-title" type="text" placeholder="Ca thi giữa kỳ" aria-invalid={!!errors.title} aria-describedby={errors.title ? "session-title-error" : undefined} className={cn(errors.title && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("title")} />
            <FieldError id="session-title-error" message={errors.title?.message} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="session-startsAt" className={labelClass}>Starts at</label>
              <Input id="session-startsAt" type="datetime-local" aria-invalid={!!errors.startsAt} aria-describedby={errors.startsAt ? "session-startsAt-error" : undefined} className={cn(errors.startsAt && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("startsAt")} />
              <FieldError id="session-startsAt-error" message={errors.startsAt?.message} />
            </div>
            <div>
              <label htmlFor="session-endsAt" className={labelClass}>Ends at</label>
              <Input id="session-endsAt" type="datetime-local" aria-invalid={!!errors.endsAt} aria-describedby={errors.endsAt ? "session-endsAt-error" : undefined} className={cn(errors.endsAt && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("endsAt")} />
              <FieldError id="session-endsAt-error" message={errors.endsAt?.message} />
            </div>
          </div>

          {/* Visibility (FE-CLASSES-2) */}
          <fieldset>
            <legend className={labelClass}>Visibility</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { value: "CLASS_RESTRICTED" as const, label: "Class-restricted", hint: "Only students in selected classes" },
                { value: "PUBLIC" as const, label: "Public", hint: "All students in your school" },
              ]).map((opt) => {
                const selected = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setValue("visibility", opt.value, { shouldValidate: false })}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border p-4 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
                      selected ? "border-[#0052FF] bg-[#0052FF]/5 text-[#0052FF]" : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                    )}
                  >
                    <span className="text-sm font-bold">{opt.label}</span>
                    <span className="text-xs font-medium opacity-80">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Class multi-select (CLASS_RESTRICTED only) */}
          {visibility === "CLASS_RESTRICTED" && (
            <fieldset>
              <legend className={labelClass}>Classes</legend>
              {classrooms.length === 0 ? (
                <p className="pl-1 text-xs text-[#64748B]">
                  You have no classes yet. Create one first (Classes page) or choose Public visibility.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {classrooms.map((c) => {
                    const checked = selectedClassIds.includes(c.id);
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
                          onChange={() =>
                            setSelectedClassIds((prev) =>
                              prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                            )
                          }
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
            </fieldset>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create session"}</Button>
            <Link href="/exam-sessions" className={buttonVariants({ variant: "outline" })}>Cancel</Link>
          </div>
        </form>
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
