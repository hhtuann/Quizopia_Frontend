"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useAttemptDetailQuery,
  useSubmitAttemptMutation,
} from "@/hooks/queries/use-student-attempt";
import { AttemptShell } from "@/components/student/AttemptShell";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { useAutosaveAnswers } from "@/lib/attempt/use-autosave";
import { useAnswerStore } from "@/lib/attempt/answer-store";
import { useStompConnection } from "@/lib/realtime/use-stomp-connection";
import { useServerTimeSync } from "@/lib/realtime/use-server-time-sync";
import type {
  AttemptDetailResponse,
  SubmitResponse,
} from "@/lib/api/student-attempt";
import type { NormalizedApiError } from "@/lib/api";

export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const id = Number(attemptId);
  const valid = Number.isFinite(id);

  const { data, isPending, isError, error } = useAttemptDetailQuery(id, valid);

  if (!valid) return <NotFound />;
  if (isPending) return <Skeleton />;
  if (isError) return <LoadError error={error as unknown as NormalizedApiError | undefined} />;
  if (!data) return <NotFound />;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 rounded-inner text-xs font-semibold uppercase tracking-wider text-[#6B7280] outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to sessions
        </Link>
      </div>
      {data.status === "IN_PROGRESS" ? (
        <InProgressShell detail={data} attemptId={id} />
      ) : (
        <AttemptShell detail={data} />
      )}
    </div>
  );
}

/** Wrapper that mounts autosave + submit logic only for IN_PROGRESS attempts. */
function InProgressShell({
  detail,
  attemptId,
}: {
  detail: AttemptDetailResponse;
  attemptId: number;
}) {
  const autosaveStatus = useAutosaveAnswers(attemptId);
  const submitMut = useSubmitAttemptMutation(attemptId);
  const router = useRouter();
  const queryClient = useQueryClient();

  // WebSocket: mount only for IN_PROGRESS attempts (InProgressShell is only
  // rendered for IN_PROGRESS — see AttemptPage :45). Connects, subscribes to
  // /user/queue/attempt, and receives SERVER_TIME_SYNC for live timer sync.
  const { status: wsStatus, client: wsClient } = useStompConnection(true);
  const { serverTime: liveServerTime } = useServerTimeSync(
    wsClient,
    wsStatus,
    () => {
      // On reconnect: refetch REST detail (authoritative source of truth).
      void queryClient.invalidateQueries({
        queryKey: ["student", "attempts", attemptId],
      });
    }
  );

  // Subscribe to any-dirty state (re-renders when dirty flags change).
  const anyDirty = useAnswerStore((s) =>
    Object.values(s.answers).some((a) => a.dirty)
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitKey, setSubmitKey] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Submit gating: disabled while saving, blocked, or answers still dirty.
  const canSubmit =
    autosaveStatus !== "saving" &&
    autosaveStatus !== "blocked" &&
    !anyDirty;

  const submitHint = !canSubmit
    ? autosaveStatus === "saving" || anyDirty
      ? "Saving answers…"
      : autosaveStatus === "blocked"
      ? "Time over — saving stopped"
      : null
    : null;

  const showRetry =
    submitError !== null && submitError.includes("Network");

  const handleConfirm = async () => {
    setConfirmOpen(false);
    // Generate key ONCE per submit intent; REUSE on network retry.
    let key = submitKey;
    if (!key) {
      key = generateSubmitKey();
      setSubmitKey(key);
    }
    setSubmitError(null);
    try {
      const res = await submitMut.mutateAsync({ key });
      setSubmitResult(res);
      setTimeout(() => router.replace("/history"), 5000);
    } catch (err) {
      const norm = err as NormalizedApiError | undefined;
      if (norm?.kind === "api") {
        switch (norm.code) {
          case "ATTEMPT_ALREADY_SUBMITTED":
            setSubmitError("This attempt was already submitted.");
            setTimeout(() => router.replace("/history"), 3000);
            break;
          case "ATTEMPT_DEADLINE_EXCEEDED":
            setSubmitError("Time is over — could not submit.");
            setTimeout(() => router.replace("/sessions"), 3000);
            break;
          case "ATTEMPT_IDEMPOTENCY_CONFLICT":
            setSubmitError("Submit conflict — please retry.");
            setSubmitKey(null);
            break;
          case "ATTEMPT_INVALID_STATE":
            setSubmitError("This attempt is already submitted or graded.");
            setTimeout(() => router.replace("/history"), 3000);
            break;
          default:
            setSubmitError(norm.message || "Submit failed. Please try again.");
        }
      } else if (norm?.kind === "network") {
        // CRITICAL: keep submitKey (don't reset) → Retry reuses the SAME key.
        setSubmitError("Network error — click Retry to submit with the same key.");
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    }
  };

  const handleRetry = () => {
    if (submitKey) void handleConfirm();
  };

  // Construct the submit area JSX (button + hint + error + result).
  const submitSlot = submitResult ? (
    <SubmitResultCard result={submitResult} />
  ) : (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={!canSubmit || submitMut.isPending}
        onClick={() => setConfirmOpen(true)}
        className="neumorphic-active-press inline-flex h-12 items-center justify-center gap-2 rounded-button bg-[#E0E5EC] px-6 text-sm font-bold text-[#3D4852] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        {submitMut.isPending ? "Submitting…" : "Submit attempt"}
      </button>
      {submitHint && (
        <p className="text-xs font-medium text-[#6B7280]">{submitHint}</p>
      )}
      {submitError && (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep">
          <span>{submitError}</span>
          {showRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={submitMut.isPending}
              className="neumorphic-active-press inline-flex h-10 items-center justify-center rounded-button bg-[#6C63FF] px-4 text-xs font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitMut.isPending ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <AttemptShell
        detail={detail}
        autosaveStatus={autosaveStatus}
        submitSlot={submitSlot}
        liveServerTime={liveServerTime}
        wsStatus={wsStatus}
      />
      <ConfirmDialog
        open={confirmOpen}
        titleId="submit-confirm-title"
        title="Submit attempt?"
        description="You can't change your answers after submitting. Make sure all answers are saved."
        confirmLabel="Confirm submit"
        cancelLabel="Cancel"
        busyLabel="Submitting…"
        busy={submitMut.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

/** Generate a stable UUID for idempotency (no whitespace, ≤100 chars). */
function generateSubmitKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Score display card after a successful submit. */
function SubmitResultCard({ result }: { result: SubmitResponse }) {
  return (
    <div className="rounded-container bg-[#E0E5EC] p-8 text-center shadow-extruded">
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#38B2AC]">
        Submitted!
      </h2>
      {result.score != null && result.maxScore != null ? (
        <p className="mt-3 text-4xl font-extrabold text-[#3D4852]">
          {result.score}
          <span className="text-xl text-[#6B7280]"> / {result.maxScore}</span>
        </p>
      ) : (
        <p className="mt-3 text-lg font-semibold text-[#6B7280]">Score: —</p>
      )}
      {result.percentage != null && (
        <p className="mt-1 text-sm font-medium text-[#6C63FF]">{result.percentage}%</p>
      )}
      <p className="mt-4 text-xs text-[#6B7280]">
        Attempt #{result.attemptNumber ?? "—"}
      </p>
      <Link
        href={`/attempts/${result.attemptId}/result`}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
      >
        View detailed result →
      </Link>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading attempt" className="space-y-4">
      <div className="h-16 animate-pulse rounded-container bg-[#E0E5EC] shadow-extruded" />
      <div className="h-48 animate-pulse rounded-container bg-[#E0E5EC] shadow-extruded" />
      <div className="h-48 animate-pulse rounded-container bg-[#E0E5EC] shadow-extruded" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E0E5EC] text-[#6B7280] shadow-inset-deep">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">Attempt not found</p>
      <p className="mt-1 text-sm text-[#6B7280]">This attempt may have been removed or you don&apos;t have access.</p>
      <Link href="/sessions" className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
        Back to sessions
      </Link>
    </div>
  );
}

function LoadError({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "ATTEMPT_NOT_FOUND":
        message = "This attempt could not be found.";
        break;
      case "ATTEMPT_ACCESS_DENIED":
        message = "You don't have access to this attempt.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load the attempt.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div role="alert" className="flex items-start gap-3 rounded-container bg-[#E0E5EC] p-5 text-sm font-medium text-[#3D4852] shadow-extruded">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <div>
        <span>{message}</span>
        <Link href="/sessions" className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
          Back to sessions
        </Link>
      </div>
    </div>
  );
}
