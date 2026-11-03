"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useExamQuery } from "@/hooks/queries/use-exams";
import { useCreateExamSessionMutation } from "@/hooks/queries/use-exam-sessions";
import { useMyClassroomsQuery } from "@/hooks/queries/use-classrooms";
import { createSessionSchema, type CreateSessionValues } from "@/lib/validation/exam-session-schemas";
import type { CreateExamSessionRequest, SessionVisibility } from "@/lib/api/exam-sessions";
import { Badge, Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";

function describeCreateError(err: unknown): { field?: "endsAt"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_CODE_CONFLICT":
        return { message: "This code is already in use. Please retry — codes are auto-generated." };
      case "EXAM_SESSION_TIME_INVALID":
        return { field: "endsAt", message: "End time must be after the start time." };
      case "EXAM_SESSION_NOT_PUBLISHED_EXAM":
        return { message: "Publish the exam before creating sessions." };
      case "EXAM_NOT_FOUND":
        return { message: "This exam could not be found." };
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
  const { examId } = useParams<{ examId: string }>();
  const examIdNum = Number(examId);
  const validId = Number.isFinite(examIdNum);

  const { data: exam, isPending: examPending, isError: examError } = useExamQuery(examIdNum, validId);
  const published = exam?.status === "PUBLISHED";

  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateSessionValues>({
    resolver: zodResolver(createSessionSchema),
    // The form below renders only once the exam has loaded, so the duration
    // default can be taken straight from the exam's editor metadata (NULL
    // backend-side = "prefill from the exam default" on create).
    defaultValues: {
      title: "",
      startsAt: "",
      endsAt: "",
      maxAttempts: 1,
      durationMinutes: exam?.durationMinutes ?? 60,
      visibility: "CLASS_RESTRICTED" as const,
    },
  });

  // Visibility + class assignment.
  const { data: classroomsData } = useMyClassroomsQuery();
  const classrooms = classroomsData?.items ?? [];
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const visibility: SessionVisibility = useWatch({ control, name: "visibility" }) ?? "CLASS_RESTRICTED";

  const mutation = useCreateExamSessionMutation(examIdNum);

  const onSubmit = async (values: CreateSessionValues) => {
    setFormError(null);
    if (values.visibility === "CLASS_RESTRICTED" && selectedClassIds.length === 0) {
      setFormError("Select at least one class for a class-restricted session, or choose Public visibility.");
      return;
    }
    const req: Omit<CreateExamSessionRequest, "examId"> = {
      title: values.title.trim(),
      // datetime-local (local) → ISO UTC. Runs in the submit handler, not render.
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      maxAttempts: values.maxAttempts,
      durationMinutes: values.durationMinutes,
      visibility: values.visibility,
      classroomIds: values.visibility === "CLASS_RESTRICTED" ? selectedClassIds : [],
    };
    try {
      await mutation.mutateAsync(req);
      router.replace(`/exams/${examIdNum}?tab=sessions`);
    } catch (err) {
      const mapped = describeCreateError(err);
      if (mapped.field) setError(mapped.field, { message: mapped.message });
      else setFormError(mapped.message);
    }
  };

  const backHref = `/exams/${examIdNum}?tab=sessions`;

  return (
    <div>
      <div className="mb-6">
        <Link href={backHref} className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">Create session</h1>
          {exam && (
            <span className="text-sm font-medium text-[#64748B]">
              for{" "}
              <Link
                href={`/exams/${exam.id}`}
                className="rounded font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
              >
                {exam.title}
              </Link>{" "}
              <Badge variant={published ? "success" : "warn"}>{exam.status}</Badge>
            </span>
          )}
        </div>
      </div>

      <div className={cn(cardVariants({ variant: "elevated" }), "max-w-2xl p-8 sm:p-10")}>
        {examPending ? (
          <p role="status" className="animate-pulse py-6 text-center text-sm text-[#64748B]">
            Loading exam…
          </p>
        ) : examError || !exam ? (
          <div role="alert" className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
            Couldn&apos;t load the exam.{" "}
            <Link href="/exams" className="font-semibold underline underline-offset-2">
              Back to exams
            </Link>
          </div>
        ) : !published ? (
          <div role="alert" className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]">
            Sessions require a <span className="font-semibold">published</span> exam. Publish it
            first from the exam&apos;s Overview tab.
          </div>
        ) : (
          <>
            {formError && (
              <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="session-maxAttempts" className={labelClass}>Max attempts <span className="font-normal normal-case text-[#64748B]/60">(0 = unlimited)</span></label>
                  <Input id="session-maxAttempts" type="number" min={0} step={1} aria-invalid={!!errors.maxAttempts} aria-describedby={errors.maxAttempts ? "session-maxAttempts-error" : undefined} className={cn(errors.maxAttempts && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("maxAttempts", { valueAsNumber: true })} />
                  <FieldError id="session-maxAttempts-error" message={errors.maxAttempts?.message} />
                </div>
                <div>
                  <label htmlFor="session-durationMinutes" className={labelClass}>Duration <span className="font-normal normal-case text-[#64748B]/60">(0 = unlimited)</span></label>
                  <Input
                    id="session-durationMinutes"
                    type="number"
                    min={0}
                    step={1}
                    aria-invalid={!!errors.durationMinutes}
                    aria-describedby={errors.durationMinutes ? "session-durationMinutes-error" : undefined}
                    className={cn(errors.durationMinutes && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
                    {...register("durationMinutes", { valueAsNumber: true })}
                  />
                  <FieldError id="session-durationMinutes-error" message={errors.durationMinutes?.message} />
                </div>
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

              {/* Visibility */}
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
                <Link href={backHref} className={buttonVariants({ variant: "outline" })}>Cancel</Link>
              </div>
            </form>
          </>
        )}
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
