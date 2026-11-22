"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useExamQuery } from "@/hooks/queries/use-exams";
import { CreateSessionForm, describeCreateError } from "@/components/teacher/CreateSessionForm";
import { Badge, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

export { describeCreateError };

/**
 * Direct `/exams/[examId]/sessions/new` route — kept for deep links; the
 * primary create flow is the modal on the exam's Sessions tab. Renders the
 * same shared `CreateSessionForm`.
 */
export default function NewExamSessionPage() {
  const router = useRouter();
  const { examId } = useParams<{ examId: string }>();
  const examIdNum = Number(examId);
  const validId = Number.isFinite(examIdNum);

  const { data: exam, isPending: examPending, isError: examError } = useExamQuery(examIdNum, validId);
  const published = exam?.status === "PUBLISHED";

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
          <CreateSessionForm
            examId={examIdNum}
            defaultDurationMinutes={exam.durationMinutes ?? 60}
            onCreated={() => router.replace(backHref)}
            onCancel={() => router.replace(backHref)}
          />
        )}
      </div>
    </div>
  );
}
