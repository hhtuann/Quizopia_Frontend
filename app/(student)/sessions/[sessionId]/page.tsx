"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionEligibilityQuery } from "@/hooks/queries/use-student-attempts";
import { useStartAttemptMutation } from "@/hooks/queries/use-student-attempt";
import { SessionLandingCard, describeStartError } from "@/components/student/SessionLandingCard";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Shared-session deep link (P2-D, issue #20): a participant opening
 * /sessions/{sessionId} gets the SERVER-AUTHORIZED eligibility state and can
 * start/resume iff the policy allows. Unauthenticated users are routed to
 * /login with a returnTo continuation by the (student) layout's RequireAuth;
 * every denied case renders a safe card without leaking session metadata.
 */
export default function SessionLandingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sessionIdNum = Number(sessionId);
  const validId = Number.isFinite(sessionIdNum);
  const router = useRouter();

  const { data, isPending, isError, error } = useSessionEligibilityQuery(sessionIdNum, validId);
  const startMutation = useStartAttemptMutation();
  const [startError, setStartError] = useState<string | null>(null);

  if (!validId) {
    return <NotFoundState />;
  }

  if (isPending) {
    return <SkeletonState />;
  }

  if (isError) {
    const norm = error as unknown as NormalizedApiError | undefined;
    const code = norm?.kind === "api" ? norm.code : undefined;
    if (code === "ATTEMPT_NOT_ELIGIBLE" || code === "ATTEMPT_PARTICIPANT_BLOCKED") {
      return (
        <DeniedState
          title="You don't have access to this session"
          detail={
            code === "ATTEMPT_PARTICIPANT_BLOCKED"
              ? "You are blocked from this session. Contact your teacher if you believe this is a mistake."
              : "This session is restricted to assigned participants. If you expected access, contact your teacher."
          }
        />
      );
    }
    if (code === "EXAM_SESSION_NOT_FOUND") {
      return <NotFoundState />;
    }
    if (code === "AUTH_ACCESS_TOKEN_INVALID") {
      return (
        <DeniedState
          title="Your session has expired"
          detail="Please sign in again to continue."
        />
      );
    }
    return (
      <ErrorState detail={(norm?.kind === "network" ? "Network error" : norm?.message) || undefined} />
    );
  }

  if (!data) {
    return <NotFoundState />;
  }

  const onStart = () => {
    setStartError(null);
    startMutation.mutate(
      { sessionId: sessionIdNum },
      {
        onSuccess: (res) => router.push(`/attempts/${res.attemptId}`),
        onError: (err) => setStartError(describeStartError(err)),
      }
    );
  };

  return (
    <div className="py-8">
      <SessionLandingCard
        eligibility={data}
        onStart={onStart}
        starting={startMutation.isPending}
      />
      {startError && (
        <p
          role="alert"
          className="mx-auto mt-4 max-w-2xl rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]"
        >
          {startError}
        </p>
      )}
    </div>
  );
}

function DeniedState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">{title}</p>
      <p className="mt-1 max-w-md text-sm text-[#64748B]">{detail}</p>
      <Link
        href="/sessions"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
      >
        Back to sessions
      </Link>
    </div>
  );
}

function NotFoundState() {
  return <DeniedState title="Session not found" detail="This link may be broken or the session was removed." />;
}

function ErrorState({ detail }: { detail?: string }) {
  return (
    <div
      role="alert"
      className="mx-auto my-16 max-w-lg rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-6 text-center"
    >
      <p className="font-display text-lg font-bold text-[#0F172A]">Couldn&apos;t load the session</p>
      <p className="mt-1 text-sm text-[#64748B]">{detail || "Please try again in a moment."}</p>
      <Link
        href="/sessions"
        className="mt-4 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5"
      >
        Back to sessions
      </Link>
    </div>
  );
}

function SkeletonState() {
  return (
    <div role="status" aria-busy="true" className="mx-auto my-16 max-w-2xl animate-pulse px-4">
      <div className="h-4 w-24 rounded bg-[#E2E8F0]" />
      <div className="mt-4 h-8 w-2/3 rounded bg-[#E2E8F0]" />
      <div className="mt-3 h-4 w-1/3 rounded bg-[#E2E8F0]" />
      <div className="mt-8 h-32 rounded-xl border border-[#E2E8F0] bg-white" />
      <span className="sr-only">Loading session…</span>
    </div>
  );
}
