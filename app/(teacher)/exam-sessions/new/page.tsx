"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSession, type CreateExamSessionRequest } from "@/lib/api/exam-sessions";
import { useExamsQuery, useExamEditorQuery } from "@/hooks/queries/use-exams";
import { createSessionSchema, type CreateSessionValues } from "@/lib/validation/exam-session-schemas";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]";
const inputClass =
  "w-full h-12 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";
const selectClass =
  "h-12 w-full rounded-button bg-[#E0E5EC] px-4 pr-9 text-sm text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";
const primaryBtn =
  "neumorphic-active-press inline-flex h-12 items-center justify-center rounded-button bg-[#6C63FF] px-6 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "inline-flex h-12 items-center justify-center rounded-button bg-[#E0E5EC] px-6 text-sm font-semibold text-[#3D4852] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]";

function describeCreateError(err: unknown): { field?: "code" | "endsAt" | "examVersionNumber"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_CODE_CONFLICT":
        return { field: "code", message: "This code is already in use." };
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
    defaultValues: { examId: NaN, examVersionNumber: NaN, code: "", title: "", startsAt: "", endsAt: "", maxAttempts: 1 },
  });

  const examId = useWatch({ control, name: "examId" });
  const examSelected = Number.isFinite(examId);
  // Reuse the FE7 editor query to read the exam's published versions ONLY.
  const { data: editorData, isPending: editorPending } = useExamEditorQuery(
    examSelected ? examId : 0,
    examSelected
  );
  const publishedVersions = editorData?.publishedVersions ?? [];

  const mutation = useMutation({
    mutationFn: (req: CreateExamSessionRequest) => createSession(req),
  });

  const onSubmit = async (values: CreateSessionValues) => {
    setFormError(null);
    const req: CreateExamSessionRequest = {
      examId: values.examId,
      examVersionNumber: values.examVersionNumber,
      code: values.code.trim(),
      title: values.title.trim(),
      // datetime-local (local) → ISO UTC. Runs in the submit handler, not render.
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      maxAttempts: values.maxAttempts,
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
        <Link href="/exam-sessions" className="inline-flex items-center gap-1.5 rounded-inner text-xs font-semibold uppercase tracking-wider text-[#6B7280] outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All sessions
        </Link>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">Create exam session</h1>
      </div>

      <div className="max-w-2xl rounded-container bg-[#E0E5EC] p-8 shadow-extruded sm:p-10">
        {formError && (
          <div role="alert" className="mb-6 flex items-start gap-2 rounded-button bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep">
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
              className={`${selectClass} ${errors.examId ? "shadow-inset-deep" : ""} disabled:opacity-70`}
              {...register("examId", {
                valueAsNumber: true,
                onChange: () => setValue("examVersionNumber", NaN),
              })}
            >
              <option value="">{examsPending ? "Loading exams…" : "Select an exam…"}</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.hasPublished}>
                  {e.code} — {e.title}{!e.hasPublished ? " (no published version)" : ""}
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
              className={`${selectClass} ${errors.examVersionNumber ? "shadow-inset-deep" : ""} disabled:opacity-70`}
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

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="session-code" className={labelClass}>Code</label>
              <input id="session-code" type="text" placeholder="e.g. S1-MID" aria-invalid={!!errors.code} aria-describedby={errors.code ? "session-code-error" : undefined} className={`${inputClass} ${errors.code ? "shadow-inset-deep" : ""}`} {...register("code")} />
              <FieldError id="session-code-error" message={errors.code?.message} />
            </div>
            <div>
              <label htmlFor="session-maxAttempts" className={labelClass}>Max attempts</label>
              <input id="session-maxAttempts" type="number" min={1} step={1} aria-invalid={!!errors.maxAttempts} aria-describedby={errors.maxAttempts ? "session-maxAttempts-error" : undefined} className={`${inputClass} ${errors.maxAttempts ? "shadow-inset-deep" : ""}`} {...register("maxAttempts", { valueAsNumber: true })} />
              <FieldError id="session-maxAttempts-error" message={errors.maxAttempts?.message} />
            </div>
          </div>

          <div>
            <label htmlFor="session-title" className={labelClass}>Title</label>
            <input id="session-title" type="text" placeholder="Ca thi giữa kỳ" aria-invalid={!!errors.title} aria-describedby={errors.title ? "session-title-error" : undefined} className={`${inputClass} ${errors.title ? "shadow-inset-deep" : ""}`} {...register("title")} />
            <FieldError id="session-title-error" message={errors.title?.message} />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="session-startsAt" className={labelClass}>Starts at</label>
              <input id="session-startsAt" type="datetime-local" aria-invalid={!!errors.startsAt} aria-describedby={errors.startsAt ? "session-startsAt-error" : undefined} className={`${inputClass} ${errors.startsAt ? "shadow-inset-deep" : ""}`} {...register("startsAt")} />
              <FieldError id="session-startsAt-error" message={errors.startsAt?.message} />
            </div>
            <div>
              <label htmlFor="session-endsAt" className={labelClass}>Ends at</label>
              <input id="session-endsAt" type="datetime-local" aria-invalid={!!errors.endsAt} aria-describedby={errors.endsAt ? "session-endsAt-error" : undefined} className={`${inputClass} ${errors.endsAt ? "shadow-inset-deep" : ""}`} {...register("endsAt")} />
              <FieldError id="session-endsAt-error" message={errors.endsAt?.message} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>{isSubmitting ? "Creating…" : "Create session"}</button>
            <Link href="/exam-sessions" className={secondaryBtn}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#3D4852]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      {message}
    </p>
  );
}
