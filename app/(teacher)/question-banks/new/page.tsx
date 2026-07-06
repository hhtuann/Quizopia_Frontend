"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBank, type CreateQuestionBankRequest } from "@/lib/api/question-banks";
import { useSubjectsQuery } from "@/hooks/queries/use-subjects";
import { createBankSchema, type CreateBankValues } from "@/lib/validation/question-bank-schemas";
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

/** Map a create-bank error (NormalizedApiError) to a field or form-level message. */
function describeCreateError(err: unknown): { field?: "code" | "subjectId"; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "QUESTION_BANK_CODE_CONFLICT":
        return { field: "code", message: "This code is already in use." };
      case "QUESTION_SUBJECT_NOT_FOUND":
        return { field: "subjectId", message: "Subject not found." };
      case "QUESTION_SUBJECT_SCHOOL_MISMATCH":
        return { message: "The selected subject is not in your school." };
      case "QUESTION_BANK_ACCESS_DENIED":
        return { message: "You don't have permission to create a question bank." };
      case "QUESTION_TEACHER_PROFILE_NOT_FOUND":
        return { message: "Teacher profile not found for your account." };
      case "QUESTION_VALIDATION_ERROR":
        return { message: norm.message || "Please check the highlighted fields." };
      default:
        return { message: norm.message || "Could not create the question bank." };
    }
  }
  if (norm?.kind === "network") {
    return { message: "Network error — check your connection and try again." };
  }
  return { message: "Something went wrong. Please try again." };
}

export default function NewQuestionBankPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: subjectsData, isPending: subjectsPending, isError: subjectsError } =
    useSubjectsQuery();
  const subjects = subjectsData?.items ?? [];
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateBankValues>({
    resolver: zodResolver(createBankSchema),
    defaultValues: { code: "", name: "", description: "", subjectId: NaN },
  });

  const mutation = useMutation({
    mutationFn: (req: CreateQuestionBankRequest) => createBank(req),
  });

  const onSubmit = async (values: CreateBankValues) => {
    setFormError(null);
    const req: CreateQuestionBankRequest = {
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      subjectId: values.subjectId,
    };
    try {
      await mutation.mutateAsync(req);
      // Refresh the banks list for any filter (prefix key) before navigating back.
      await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
      router.replace("/question-banks");
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
          href="/question-banks"
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
          All banks
        </Link>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">
          Create question bank
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
          <div>
            <label htmlFor="bank-code" className={labelClass}>
              Code
            </label>
            <input
              id="bank-code"
              type="text"
              placeholder="e.g. MIDTERM-SETS"
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? "bank-code-error" : undefined}
              className={`${inputClass} ${errors.code ? "shadow-inset-deep" : ""}`}
              {...register("code")}
            />
            <FieldError id="bank-code-error" message={errors.code?.message} />
          </div>

          <div>
            <label htmlFor="bank-name" className={labelClass}>
              Name
            </label>
            <input
              id="bank-name"
              type="text"
              placeholder="Bộ đề giữa kỳ"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "bank-name-error" : undefined}
              className={`${inputClass} ${errors.name ? "shadow-inset-deep" : ""}`}
              {...register("name")}
            />
            <FieldError id="bank-name-error" message={errors.name?.message} />
          </div>

          <div>
            <label htmlFor="bank-description" className={labelClass}>
              Description <span className="font-normal normal-case text-[#A0AEC0]">(optional)</span>
            </label>
            <textarea
              id="bank-description"
              placeholder="What is this bank for?"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "bank-description-error" : undefined}
              className={`${textareaClass} ${errors.description ? "shadow-inset-deep" : ""}`}
              {...register("description")}
            />
            <FieldError id="bank-description-error" message={errors.description?.message} />
          </div>

          <div>
            <label htmlFor="bank-subject" className={labelClass}>
              Subject
            </label>
            {subjectsError ? (
              <p role="alert" className="pl-1 text-sm font-medium text-[#3D4852]">
                Couldn&apos;t load subjects.{" "}
                <Link
                  href="/question-banks/new"
                  className="font-semibold text-[#6C63FF] outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] rounded-inner"
                >
                  Retry
                </Link>
              </p>
            ) : (
              <select
                id="bank-subject"
                disabled={subjectsPending}
                aria-invalid={!!errors.subjectId}
                aria-describedby={errors.subjectId ? "bank-subject-error" : undefined}
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
            )}
            <FieldError id="bank-subject-error" message={errors.subjectId?.message} />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              {isSubmitting ? "Creating…" : "Create bank"}
            </button>
            <Link href="/question-banks" className={secondaryBtn}>
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
