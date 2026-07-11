"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAvailableSessionsQuery } from "@/hooks/queries/use-student-attempts";
import { useStartAttemptMutation } from "@/hooks/queries/use-student-attempt";
import { Badge, Button, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { AvailableSessionItem } from "@/lib/api/student-attempts";
import type { NormalizedApiError } from "@/lib/api";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Tone = "accent" | "active" | "muted";

/** Derive the most relevant display flag from the session's pre-computed booleans. */
function sessionFlag(item: AvailableSessionItem): { label: string; tone: Tone } {
  if (item.canStartNow) return { label: "Available to start", tone: "accent" };
  if (item.canResume) return { label: "Resume active attempt", tone: "active" };
  // Active attempt that expired (now > deadline) — Day 7 doesn't finalize; pending.
  if (item.activeAttemptId !== null && !item.canResume && !item.canStartNow)
    return { label: "Expired attempt — pending finalization", tone: "muted" };
  if (item.remainingAttempts === 0) return { label: "No attempts remaining", tone: "muted" };
  // Not in window yet (e.g. SCHEDULED, startsAt in the future).
  return { label: `Starts ${formatDateTime(item.startsAt)}`, tone: "muted" };
}

function flagVariant(tone: Tone): "accent" | "success" | "default" {
  if (tone === "accent") return "accent";
  if (tone === "active") return "success";
  return "default";
}

/** Map a start-attempt error to a short message. */
function describeStartError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "ATTEMPT_DEADLINE_EXCEEDED":
        return "The active attempt has expired — it will be finalized later.";
      case "ATTEMPT_SESSION_NOT_OPEN":
        return "The session is not open yet.";
      case "ATTEMPT_OUTSIDE_WINDOW":
        return "The session is outside its time window.";
      case "ATTEMPT_MAX_REACHED":
        return "Maximum attempts reached.";
      case "ATTEMPT_PARTICIPANT_BLOCKED":
        return "You are blocked from this session.";
      case "ATTEMPT_ACCESS_DENIED":
        return "You don't have access to this session.";
      default:
        return norm.message || "Could not start the attempt.";
    }
  }
  if (norm?.kind === "network") return "Network error — check your connection.";
  return "Something went wrong. Please try again.";
}

export default function StudentSessionsPage() {
  const { data, isPending, isError, error } = useAvailableSessionsQuery();
  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-6 select-none">
        <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
          Available sessions
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          Exam sessions you can take.
        </p>
      </div>

      {isPending ? (
        <Skeleton />
      ) : isError ? (
        <ErrorState error={error as unknown as NormalizedApiError | undefined} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {items.map((s) => (
            <SessionCard key={s.sessionId} item={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ item }: { item: AvailableSessionItem }) {
  const flag = sessionFlag(item);
  const router = useRouter();
  const startMut = useStartAttemptMutation();
  const [startError, setStartError] = useState<string | null>(null);
  return (
    <div className={cn(cardVariants({ variant: "elevated" }), "p-6")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            {item.exam.title}
          </h2>
          <p className="mt-0.5 text-sm text-[#64748B]">{item.exam.subjectName}</p>
        </div>
        <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B]">
          {item.code}
        </span>
      </div>

      <p className="mb-4 text-sm font-medium text-[#0F172A]">{item.title}</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="font-mono uppercase tracking-[0.1em] text-[#64748B]">Window</dt>
          <dd className="mt-0.5 text-[#0F172A]">
            {formatDateTime(item.startsAt)} → {formatDateTime(item.endsAt)}
          </dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-[0.1em] text-[#64748B]">Duration</dt>
          <dd className="mt-0.5 text-[#0F172A]">
            {item.durationMinutes != null ? `${item.durationMinutes} min` : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-[0.1em] text-[#64748B]">Attempts</dt>
          <dd className="mt-0.5 text-[#0F172A]">
            {item.maxAttempts === 0 ? (
              <span>{item.attemptsUsed} used · <span className="font-semibold text-[#0052FF]">Unlimited</span></span>
            ) : (
              <span>
                {item.attemptsUsed}
                {item.maxAttempts != null ? ` / ${item.maxAttempts}` : ""} used ·{" "}
                <span className="font-semibold">{item.remainingAttempts} left</span>
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-[0.1em] text-[#64748B]">Status</dt>
          <dd className="mt-0.5">
            <Badge variant={flagVariant(flag.tone)}>{flag.label}</Badge>
          </dd>
        </div>
      </dl>

      {item.canResume && item.activeAttemptDeadlineAt && (
        <p className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-2 text-xs font-medium text-[#64748B]">
          Active attempt deadline: {formatDateTime(item.activeAttemptDeadlineAt)}
        </p>
      )}

      {/* Start / Resume / Countdown / Expired */}
      <div className="mt-4 flex flex-wrap gap-3">
        {item.canStartNow && (
          <Button
            type="button"
            disabled={startMut.isPending}
            onClick={async () => {
              setStartError(null);
              try {
                const res = await startMut.mutateAsync({ sessionId: item.sessionId });
                router.push(`/attempts/${res.attemptId}`);
              } catch (err) {
                setStartError(describeStartError(err));
              }
            }}
          >
            {startMut.isPending ? "Starting…" : "Start attempt"}
          </Button>
        )}
        {item.canResume && item.activeAttemptId !== null && (
          <button
            type="button"
            onClick={() => router.push(`/attempts/${item.activeAttemptId}`)}
            className={buttonVariants({ variant: "outline" })}
          >
            Resume attempt
          </button>
        )}
        {/* Countdown: session not yet open */}
        {!item.canStartNow && !item.canResume && new Date(item.startsAt).getTime() > Date.now() && (
          <CountdownButton startsAt={item.startsAt} />
        )}
        {/* Expired: session window has passed */}
        {!item.canStartNow && !item.canResume && new Date(item.endsAt).getTime() <= Date.now() && (
          <button
            type="button"
            disabled
            className={cn(buttonVariants({ variant: "outline" }), "cursor-not-allowed opacity-50")}
          >
            Session ended
          </button>
        )}
      </div>
      {startError && (
        <p role="alert" className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-2 text-xs font-medium text-[#EF4444]">
          {startError}
        </p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading available sessions" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Countdown button — shows time remaining until the session opens.
 *  When it hits 0, the page refetches and the real "Start attempt" button appears. */
function CountdownButton({ startsAt }: { startsAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(startsAt).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(startsAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [startsAt]);

  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <button
      type="button"
      disabled
      className={cn(buttonVariants({ variant: "outline" }), "cursor-default font-mono")}
    >
      Opens in {text}
    </button>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "ATTEMPT_ACCESS_DENIED":
        message = "You don't have access to exam sessions.";
        break;
      case "ATTEMPT_STUDENT_PROFILE_NOT_FOUND":
        message = "Your student profile wasn't found. Please contact your school.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load available sessions.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0V18a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 18v.75m-18 0h18" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#0F172A]">No sessions available</p>
      <p className="mt-1 text-sm text-[#64748B]">Check back later for new exam sessions.</p>
    </div>
  );
}
