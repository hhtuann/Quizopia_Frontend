"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createExam, type CreateExamRequest } from "@/lib/api/exams";
import { useSubjectsQuery } from "@/hooks/queries/use-subjects";
import { useExamPurposesQuery } from "@/hooks/queries/use-exams";
import { createExamSchema, type CreateExamValues } from "@/lib/validation/exam-schemas";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]";

const inputClass =
  "w-full h-12 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const textareaClass =
  "w-full min-h-[96px] rounded-button bg-[#E0E5EC] px-4 py-3 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300 resize-y";

const selectClass =
  "h-12 w-full rounded-button bg-[#E0E5EC] px-4 pr-9 text-sm text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const primaryBtn =
  "neumorphic-active-press inline-flex h-12 items-center justify-center rounded-button bg-[#6C63FF] px-6 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtn =
  "inline-flex h-12 items-center justify-center rounded-button bg-[#E0E5EC] px-6 text-sm font-semibold text-[#3D4852] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]";

function describeCreateError(
  err: unknown
): { field?: "code" | "subjectId" | "purposeId"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_CODE_CONFLICT":
        return { field: "code", message: "This code is already in use." };
      case "EXAM_SUBJECT_NOT_FOUND":
        return { field: "subjectId", message: "Subject not found." };
      case "EXAM_SUBJECT_SCHOOL_MISMATCH":
        return { message: "The selected subject is not in your school." };
      case "EXAM_PURPOSE_NOT_FOUND":
        return { field: "purposeId", message: "Exam purpose not found." };
      case "EXAM_PURPOSE_SCHOOL_MISMATCH":
        return { message: "The selected exam purpose is not in your school." };
      case "EXAM_ACCESS_DENIED":
        return { message: "You don't have permission to create an exam." };
      case "EXAM_TEACHER_PROFILE_NOT_FOUND":
        return { message: "Teacher profile not found for your account." };
      case "EXAM_VALIDATION_ERROR":
        return { message: norm.message || "Please check the highlighted fields." };
      default:
        return { message: norm.message || "Could not create the exam." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}

export default function NewExamPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: subjectsData, isPending: subjectsPending, isError: subjectsError } =
    useSubjectsQuery();
  const subjects = subjectsData?.items ?? [];

  const { data: purposesData, isPending: purposesPending, isError: purposesError } =
    useExamPurposesQuery();
  const purposes = purposesData?.items ?? [];

  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateExamValues>({
    resolver: zodResolver(createExamSchema),
    defaultValues: { subjectId: NaN, purposeId: "", code: "", title: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: (req: CreateExamRequest) => createExam(req),
  });

  const onSubmit = async (values: CreateExamValues) => {
    setFormError(null);
    const req: CreateExamRequest = {
      subjectId: values.subjectId,
      purposeId: values.purposeId && values.purposeId !== "" ? Number(values.purposeId) : null,
      code: values.code.trim(),
      title: values.title.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
    };
    try {
      await mutation.mutateAsync(req);
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      router.replace("/exams");
    } catch (err) {
      const mapped = describeCreateError(err);
      if (mapped.field) {
        setError(mapped.field, { message: mapped.message });
      } else {
        setFormError(mapped.message);
      }
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/exams"
          className="inline-flex items-center gap-1.5 rounded-inner text-xs font-semibold uppercase tracking-wider text-[#6B7280] outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All exams
        </Link>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
          Create exam
        </h1>
      </div>

      <div className="max-w-2xl rounded-container bg-[#E0E5EC] p-8 shadow-extruded sm:p-10">
        {formError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-button bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span>{formError}</span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="exam-subject" className={labelClass}>
                Subject
              </label>
              <select
                id="exam-subject"
                disabled={subjectsPending}
                aria-invalid={!!errors.subjectId}
                aria-describedby={errors.subjectId ? "exam-subject-error" : undefined}
                className={`${selectClass} ${errors.subjectId ? "shadow-inset-deep" : ""} disabled:opacity-70`}
                {...register("subjectId", { valueAsNumber: true })}
              >
                <option value="">
                  {subjectsPending ? "Loading subjects…" : "Select a subject…"}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
              {subjectsError && (
                <p className="mt-1.5 pl-1 text-xs font-medium text-[#3D4852]">
                  Couldn&apos;t load subjects.
                </p>
              )}
              <FieldError id="exam-subject-error" message={errors.subjectId?.message} />
            </div>

            <div>
              <label htmlFor="exam-purpose" className={labelClass}>
                Purpose <span className="font-normal normal-case text-[#A0AEC0]">(optional)</span>
              </label>
              <select
                id="exam-purpose"
                disabled={purposesPending}
                aria-invalid={!!errors.purposeId}
                aria-describedby={errors.purposeId ? "exam-purpose-error" : undefined}
                className={`${selectClass} ${errors.purposeId ? "shadow-inset-deep" : ""} disabled:opacity-70`}
                {...register("purposeId")}
              >
                <option value="">
                  {purposesPending ? "Loading purposes…" : "None"}
                </option>
                {purposes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.title}
                  </option>
                ))}
              </select>
              {purposesError && (
                <p className="mt-1.5 pl-1 text-xs font-medium text-[#3D4852]">
                  Couldn&apos;t load purposes.
                </p>
              )}
              <FieldError id="exam-purpose-error" message={errors.purposeId?.message} />
            </div>
          </div>

          <div>
            <label htmlFor="exam-code" className={labelClass}>
              Code
            </label>
            <input
              id="exam-code"
              type="text"
              placeholder="e.g. MIDTERM-MATH"
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? "exam-code-error" : undefined}
              className={`${inputClass} ${errors.code ? "shadow-inset-deep" : ""}`}
              {...register("code")}
            />
            <FieldError id="exam-code-error" message={errors.code?.message} />
          </div>

          <div>
            <label htmlFor="exam-title" className={labelClass}>
              Title
            </label>
            <input
              id="exam-title"
              type="text"
              placeholder="Đề giữa kỳ Toán 2026"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "exam-title-error" : undefined}
              className={`${inputClass} ${errors.title ? "shadow-inset-deep" : ""}`}
              {...register("title")}
            />
            <FieldError id="exam-title-error" message={errors.title?.message} />
          </div>

          <div>
            <label htmlFor="exam-description" className={labelClass}>
              Description <span className="font-normal normal-case text-[#A0AEC0]">(optional)</span>
            </label>
            <textarea
              id="exam-description"
              placeholder="What is this exam for?"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "exam-description-error" : undefined}
              className={`${textareaClass} ${errors.description ? "shadow-inset-deep" : ""}`}
              {...register("description")}
            />
            <FieldError id="exam-description-error" message={errors.description?.message} />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              {isSubmitting ? "Creating…" : "Create exam"}
            </button>
            <Link href="/exams" className={secondaryBtn}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#3D4852]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
      {message}
    </p>
  );
}
