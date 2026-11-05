"use client";
import { Badge, Button, cardVariants } from "@/components/ui";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { SessionEligibility } from "@/lib/api/student-attempts";
import type { NormalizedApiError } from "@/lib/api";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Friendly mapping for start/resume failures on the landing page. */
export function describeStartError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "ATTEMPT_SESSION_NOT_OPEN":
        return "The session is not open for attempts right now.";
      case "ATTEMPT_OUTSIDE_WINDOW":
        return "The session window has not started yet or is already over.";
      case "ATTEMPT_MAX_REACHED":
        return "You have used all attempts for this session.";
      case "ATTEMPT_PARTICIPANT_BLOCKED":
        return "You are blocked from this session. Contact your teacher.";
      case "ATTEMPT_DEADLINE_EXCEEDED":
        return "Your previous attempt's time is over.";
      case "ATTEMPT_NOT_ELIGIBLE":
        return "You don't have access to this session.";
      case "AUTH_ACCESS_TOKEN_INVALID":
        return "Your session has expired — please sign in again.";
      default:
        return norm.message || "Could not start the attempt. Please try again.";
    }
  }
  if (norm?.kind === "network") {
    return "Network error — check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

const STATE_COPY: Record<
  SessionEligibility["state"],
  { label: string; badge: "accent" | "success" | "warn" | "default" }
> = {
  CAN_START: { label: "Available to start", badge: "accent" },
  CAN_RESUME: { label: "Resume your attempt", badge: "success" },
  NOT_YET_STARTED: { label: "Not started yet", badge: "default" },
  NO_ATTEMPTS_LEFT: { label: "No attempts remaining", badge: "warn" },
  ATTEMPT_EXPIRED: { label: "Your attempt time is over", badge: "warn" },
  ENDED: { label: "This session has ended", badge: "default" },
};

/**
 * Participant-facing session landing (P2-D, issue #20): renders the
 * server-authorized eligibility state for a shared session link with a
 * Start/Resume action. Server state is the single source of truth — the card
 * never guesses eligibility from the clock.
 */
export function SessionLandingCard({
  eligibility,
  onStart,
  starting,
}: {
  eligibility: SessionEligibility;
  onStart: () => void;
  starting: boolean;
}) {
  const copy = STATE_COPY[eligibility.state];
  const unlimited = eligibility.maxAttempts === 0;
  const actionable = eligibility.state === "CAN_START" || eligibility.state === "CAN_RESUME";

  return (
    <div className={cn(cardVariants({ variant: "elevated" }), "mx-auto max-w-2xl p-6")}>
      <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
        Exam session
      </p>
      <h1 className="mt-2 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
        {eligibility.title}
      </h1>
      <p className="mt-1 text-sm font-medium text-[#64748B]">{eligibility.examTitle}</p>

      <div className="mt-4">
        <Badge variant={copy.badge}>{copy.label}</Badge>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Window</dt>
          <dd className="mt-1 text-sm font-medium text-[#0F172A]">
            {formatDateTime(eligibility.startsAt)} → {formatDateTime(eligibility.endsAt)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Duration</dt>
          <dd className="mt-1 text-sm font-medium text-[#0F172A]">
            {eligibility.durationMinutes > 0
              ? `${eligibility.durationMinutes} minutes per attempt`
              : "No time limit per attempt"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Attempts</dt>
          <dd className="mt-1 text-sm font-medium text-[#0F172A]">
            {unlimited
              ? "Unlimited"
              : `${eligibility.remainingAttempts} of ${eligibility.maxAttempts} remaining`}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Access</dt>
          <dd className="mt-1 text-sm font-medium text-[#0F172A]">
            {eligibility.visibility === "PUBLIC"
              ? "Public — signed-in members"
              : "Assigned classes"}
          </dd>
        </div>
      </dl>

      {eligibility.state === "NOT_YET_STARTED" && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-4 text-sm font-medium text-[#64748B]"
        >
          This session opens on {formatDateTime(eligibility.startsAt)}. Come back then — or find it
          in your Sessions list once it opens.
        </p>
      )}
      {eligibility.state === "ENDED" && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-4 text-sm font-medium text-[#64748B]"
        >
          This session is closed or its time window has passed. Check your{" "}
          <Link href="/attempts" className="font-semibold text-[#0052FF] hover:underline">
            attempt history
          </Link>
          .
        </p>
      )}
      {eligibility.state === "NO_ATTEMPTS_LEFT" && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]"
        >
          You have used all {eligibility.maxAttempts} attempts for this session.
        </p>
      )}
      {eligibility.state === "ATTEMPT_EXPIRED" && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]"
        >
          Your attempt&apos;s time ran out.
        </p>
      )}

      {actionable && (
        <div className="mt-6">
          <Button
            type="button"
            onClick={onStart}
            disabled={starting}
            aria-label={
              eligibility.state === "CAN_RESUME" ? "Resume your attempt" : "Start the attempt"
            }
          >
            {starting
              ? eligibility.state === "CAN_RESUME"
                ? "Opening…"
                : "Starting…"
              : eligibility.state === "CAN_RESUME"
                ? "Resume attempt"
                : "Start attempt"}
          </Button>
        </div>
      )}
    </div>
  );
}
