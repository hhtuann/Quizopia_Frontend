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
import { Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";

const textareaClass =
  "w-full min-h-[96px] rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 resize-y focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

const selectClass =
  "h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";

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
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
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
        <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Create question bank
        </h1>
      </div>

      <div className={cn(cardVariants({ variant: "elevated" }), "max-w-2xl p-8 sm:p-10")}>
        {formError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
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
            <Input
              id="bank-code"
              type="text"
              placeholder="e.g. MIDTERM-SETS"
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? "bank-code-error" : undefined}
              className={cn(errors.code && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
              {...register("code")}
            />
            <FieldError id="bank-code-error" message={errors.code?.message} />
          </div>

          <div>
            <label htmlFor="bank-name" className={labelClass}>
              Name
            </label>
            <Input
              id="bank-name"
              type="text"
              placeholder="Bộ đề giữa kỳ"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "bank-name-error" : undefined}
              className={cn(errors.name && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
              {...register("name")}
            />
            <FieldError id="bank-name-error" message={errors.name?.message} />
          </div>

          <div>
            <label htmlFor="bank-description" className={labelClass}>
              Description <span className="font-normal normal-case text-[#64748B]/60">(optional)</span>
            </label>
            <textarea
              id="bank-description"
              placeholder="What is this bank for?"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "bank-description-error" : undefined}
              className={cn(textareaClass, errors.description && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
              {...register("description")}
            />
            <FieldError id="bank-description-error" message={errors.description?.message} />
          </div>

          <div>
            <label htmlFor="bank-subject" className={labelClass}>
              Subject
            </label>
            {subjectsError ? (
              <p role="alert" className="pl-1 text-sm font-medium text-[#EF4444]">
                Couldn&apos;t load subjects.{" "}
                <Link
                  href="/question-banks/new"
                  className="rounded font-semibold text-[#0052FF] outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
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
                className={cn(selectClass, errors.subjectId && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]", "disabled:opacity-70")}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create bank"}
            </Button>
            <Link href="/question-banks" className={buttonVariants({ variant: "outline" })}>
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
      className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#EF4444]"
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
