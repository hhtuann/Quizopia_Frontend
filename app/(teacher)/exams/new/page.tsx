"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateExamForm } from "@/components/teacher/CreateExamForm";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Direct `/exams/new` route — kept for deep links; the primary create flow is
 * the modal on `/exams`. Renders the same shared `CreateExamForm`.
 */
export default function NewExamPage() {
  const router = useRouter();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/exams"
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
          All exams
        </Link>
        <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Create exam
        </h1>
      </div>

      <div className={cn(cardVariants({ variant: "elevated" }), "max-w-2xl p-8 sm:p-10")}>
        <CreateExamForm
          onCreated={() => router.replace("/exams")}
          onCancel={() => router.replace("/exams")}
        />
      </div>
    </div>
  );
}
