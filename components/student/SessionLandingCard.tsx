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
      case "ATTEMPT_DEADLINE_EXCEEDED":
        return "Your previous attempt's time is over.";
      case "ATTEMPT_NOT_ELIGIBLE":
        return "You don't have access to this session.";
      case "ATTEMPT_MONITORING_START_UNAVAILABLE":
        return "This session is monitored and camera verification is not available yet — you cannot start a new attempt right now.";
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
  historyHref = "/attempts",
}: {
  eligibility: SessionEligibility;
  onStart: () => void;
  starting: boolean;
  /** Where the ENDED card links for history (role-aware, N1). */
  historyHref?: string;
}) {
  const copy = STATE_COPY[eligibility.state];
  const unlimited = eligibility.maxAttempts === 0;
  const actionable = eligibility.state === "CAN_START" || eligibility.state === "CAN_RESUME";
  // P4-A: monitored sessions are fail-closed for NEW attempts until camera
  // verification arrives (next milestone). Resume keeps working.
  const monitored = eligibility.monitoring?.monitoringEnabled === true;
  const startBlocked = monitored && eligibility.state === "CAN_START";
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
          <Link href={historyHref} className="font-semibold text-[#0052FF] hover:underline">
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

      {monitored && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-[#0052FF]/30 bg-[#0052FF]/5 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-[#0052FF]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            Camera required — monitored session
          </p>
          <p className="mt-2 text-sm font-medium text-[#0F172A]">
            This exam is monitored: your activity during the attempt (tab and
            window focus, question navigation, answers) is recorded for
            review, and camera verification is required to start. Starting
            here means you consent to this monitoring.
          </p>
          <p className="mt-1.5 text-xs font-medium text-[#64748B]">
            Activity is retained for 90 days; camera evidence for 30 days.
          </p>
          {startBlocked && (
            <p className="mt-2 text-sm font-semibold text-[#0F172A]">
              Camera verification is not available yet (it arrives in the next
              milestone) — you cannot start a new attempt yet.
            </p>
          )}
        </div>
      )}

      {actionable && (
        <div className="mt-6">
          <Button
            type="button"
            onClick={onStart}
            disabled={starting || startBlocked}
            aria-label={
              eligibility.state === "CAN_RESUME" ? "Resume your attempt" : "Start the attempt"
            }
            aria-describedby={startBlocked ? "monitored-start-blocked" : undefined}
          >
            {starting
              ? eligibility.state === "CAN_RESUME"
                ? "Opening…"
                : "Starting…"
              : eligibility.state === "CAN_RESUME"
                ? "Resume attempt"
                : "Start attempt"}
          </Button>
          {startBlocked && (
            <p id="monitored-start-blocked" role="status" className="mt-2 text-xs font-semibold text-[#F59E0B]">
              Start is unavailable until camera verification is enabled for monitored sessions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
