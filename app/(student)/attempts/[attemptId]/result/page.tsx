"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAttemptDetailQuery } from "@/hooks/queries/use-student-attempt";
import { useAttemptResultQuery } from "@/hooks/queries/use-student-results";
import { AttemptResultView } from "@/components/student/AttemptResultView";
import type { NormalizedApiError } from "@/lib/api";

export default function AttemptResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);

  const detailQuery = useAttemptDetailQuery(id, valid);
  const resultQuery = useAttemptResultQuery(id, valid);

  const loading = detailQuery.isPending || resultQuery.isPending;
  const error = detailQuery.error ?? resultQuery.error;

  if (!valid) return <NotFound />;
  if (loading) return <Skeleton />;
  if (error) return <LoadError error={error as unknown as NormalizedApiError | undefined} />;
  if (!resultQuery.data) return <NotFound />;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to history
        </Link>
        <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Your result
        </h1>
      </div>

      <AttemptResultView
        result={resultQuery.data}
        detail={detailQuery.data ?? null}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading result" className="space-y-4">
      <div className="h-32 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]" />
      <div className="h-48 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">Result not found</p>
      <p className="mt-1 text-sm text-[#64748B]">This result may not be available yet or you don&apos;t have access.</p>
      <Link href="/history" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
        Back to history
      </Link>
    </div>
  );
}

function LoadError({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "ATTEMPT_NOT_FOUND":
      case "RESULT_NOT_FOUND":
        message = "This result could not be found.";
        break;
      case "ATTEMPT_ACCESS_DENIED":
      case "RESULT_ACCESS_DENIED":
        message = "You don't have access to this result.";
        break;
      case "ATTEMPT_NOT_SUBMITTED":
        message = "This attempt hasn't been submitted yet.";
        break;
      case "ATTEMPT_NOT_GRADED":
        message = "This attempt hasn't been graded yet.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load the result.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <div>
        <span>{message}</span>
        <Link href="/history" className="mt-3 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
          Back to history
        </Link>
      </div>
    </div>
  );
}
