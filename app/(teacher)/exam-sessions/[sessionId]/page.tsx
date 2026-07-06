"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useExamSessionDetailQuery,
  useSessionActionMutation,
  useUpdateSessionMutation,
} from "@/hooks/queries/use-exam-sessions";
import type {
  ExamSessionDetailResponse,
  ExamSessionStatus,
  SessionLifecycleAction,
  UpdateExamSessionRequest,
} from "@/lib/api/exam-sessions";
import { updateSessionSchema, type UpdateSessionValues } from "@/lib/validation/exam-session-schemas";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { ParticipantsManager } from "@/components/teacher/session-participants/ParticipantsManager";
import type { NormalizedApiError } from "@/lib/api";

const EDITABLE_STATES: ExamSessionStatus[] = ["DRAFT", "SCHEDULED"];

const inputClass =
  "w-full h-12 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";
const labelClass = "mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]";
const primaryBtn =
  "neumorphic-active-press inline-flex h-11 items-center justify-center rounded-button bg-[#6C63FF] px-5 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-button bg-[#E0E5EC] px-5 text-sm font-semibold text-[#3D4852] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Convert an ISO instant to the `yyyy-MM-ddTHH:mm` LOCAL value a datetime-local
 * input expects. Client-only (the form renders post-fetch). Uses the Date
 * object's local getters (NOT argless `new Date()`); the reverse conversion at
 * submit uses `new Date(local).toISOString()`, so the round trip is
 * timezone-correct (no hardcoded offset).
 */
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusTone(status: ExamSessionStatus): string {
  switch (status) {
    case "OPEN":
      return "text-[#38B2AC]";
    case "CANCELLED":
    case "CLOSED":
      return "text-[#A0AEC0]";
    default:
      return "text-[#6C63FF]";
  }
}

/** Config PUT error → field/form message. `conflict` → refetch-worthy 409. */
function describeConfigError(err: unknown): { field?: "endsAt"; conflict?: boolean; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_CONCURRENT_MODIFICATION":
        return { conflict: true, message: "This session was changed by another session. Refreshed to the latest — review and retry." };
      case "EXAM_SESSION_INVALID_STATE":
        return { conflict: true, message: "The session can no longer be edited in its current state." };
      case "EXAM_SESSION_TIME_INVALID":
        return { field: "endsAt", message: "End time must be after the start time." };
      case "EXAM_SESSION_ACCESS_DENIED":
        return { message: "You don't have permission to edit this session." };
      case "EXAM_VALIDATION_ERROR":
        return { message: norm.message || "Please check the highlighted fields." };
      default:
        return { message: norm.message || "Could not save the configuration." };
    }
  }
  if (norm?.kind === "network") return { message: "Network error — check your connection and try again." };
  return { message: "Something went wrong. Please try again." };
}

/** Lifecycle error → notice. `conflict` → refetch-worthy 409. */
function describeActionError(err: unknown): { conflict?: boolean; message: string } {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    switch (norm.code) {
      case "EXAM_SESSION_INVALID_STATE":
        return { conflict: true, message: "That action isn't valid in the current state." };
      case "EXAM_SESSION_TIME_INVALID":
        return { message: "The session is outside its scheduled time window." };
      case "EXAM_SESSION_ACCESS_DENIED":
        return { message: "You don't have permission for this action." };
      default:
        return { message: norm.message || "Action failed. Please try again." };
    }
  }
  if (norm?.kind === "network") return { message: "Network error — check your connection and try again." };
  return { message: "Something went wrong. Please try again." };
}

export default function ExamSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sessionIdNum = Number(sessionId);
  const validId = Number.isFinite(sessionIdNum);

  const { data, isPending, isError, error } = useExamSessionDetailQuery(sessionIdNum, validId);

  if (!validId) return <NotFound />;
  if (isPending) return <Skeleton />;
  if (isError) return <LoadError error={error as unknown as NormalizedApiError | undefined} />;
  if (!data) return <NotFound />;
  return <DetailView data={data} />;
}

function DetailView({ data }: { data: ExamSessionDetailResponse }) {
  const queryClient = useQueryClient();
  const actionMut = useSessionActionMutation(data.id);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<Extract<SessionLifecycleAction, "close" | "cancel"> | null>(null);

  const editable = EDITABLE_STATES.includes(data.status);

  const runAction = async (action: SessionLifecycleAction) => {
    setConfirmAction(null);
    setNotice(null);
    try {
      await actionMut.mutateAsync(action);
      const verb = action === "schedule" ? "scheduled" : action === "open" ? "opened" : action === "close" ? "closed" : "cancelled";
      setNotice({ kind: "success", message: `Session ${verb}.` });
    } catch (err) {
      const m = describeActionError(err);
      setNotice({ kind: "error", message: m.message });
      if (m.conflict) queryClient.invalidateQueries({ queryKey: ["exam-sessions", data.id, "detail"] });
    }
  };

  const onConfirm = () => {
    if (confirmAction) void runAction(confirmAction);
  };

  const facts: { label: string; value: string }[] = [
    { label: "Exam", value: `#${data.examId} · version ${data.examVersionNumber}` },
    { label: "Opened at", value: formatDateTime(data.openedAt) },
    { label: "Closed at", value: formatDateTime(data.closedAt) },
    { label: "Participants", value: String(data.participantCount) },
    { label: "Version token", value: data.version != null ? String(data.version) : "—" },
    { label: "Created", value: formatDateTime(data.createdAt) },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link href="/exam-sessions" className="inline-flex items-center gap-1.5 rounded-inner text-xs font-semibold uppercase tracking-wider text-[#6B7280] outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#3D4852] sm:text-3xl">{data.title}</h1>
          <span className={`rounded-inner bg-[#E0E5EC] px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-inset-small ${statusTone(data.status)}`}>
            {data.status}
          </span>
          <span className="rounded-inner bg-[#E0E5EC] px-2 py-0.5 font-mono text-xs shadow-inset-small">{data.code}</span>
        </div>
      </div>

      {notice && (
        <div role={notice.kind === "success" ? "status" : "alert"} className={`mb-6 flex items-start gap-2 rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium shadow-inset-deep ${notice.kind === "success" ? "text-[#38B2AC]" : "text-[#3D4852]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>{notice.message}</span>
        </div>
      )}

      {/* Config form — editable only in DRAFT/SCHEDULED. Keyed by version so it re-initialises after each save/refetch. */}
      {editable ? (
        <ConfigForm key={data.version ?? 0} session={data} />
      ) : (
        <div className="mb-6 rounded-container bg-[#E0E5EC] p-6 shadow-extruded">
          <p className="text-sm font-medium text-[#6B7280]">
            Configuration is locked — the session is <span className="font-semibold text-[#3D4852]">{data.status}</span>.
          </p>
        </div>
      )}

      {/* Read-only facts */}
      <div className="mb-6 rounded-container bg-[#E0E5EC] p-6 shadow-extruded">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Session details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((r) => (
            <div key={r.label} className="flex flex-col">
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{r.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-[#3D4852]">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 rounded-2xl bg-[#E0E5EC] px-4 py-3 text-xs font-medium text-[#6B7280] shadow-inset-small">
          Manage participant access in the section below.
        </p>
      </div>

      {/* Lifecycle — state-gated buttons. */}
      <div className="rounded-container bg-[#E0E5EC] p-6 shadow-extruded">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Lifecycle</h2>
        <div className="flex flex-wrap gap-3">
          {data.status === "DRAFT" && (
            <>
              <button type="button" onClick={() => runAction("schedule")} disabled={actionMut.isPending} className={primaryBtn}>
                {actionMut.isPending ? "Working…" : "Schedule"}
              </button>
              <button type="button" onClick={() => setConfirmAction("cancel")} disabled={actionMut.isPending} className={secondaryBtn}>
                Cancel session
              </button>
            </>
          )}
          {data.status === "SCHEDULED" && (
            <>
              <button type="button" onClick={() => runAction("open")} disabled={actionMut.isPending} className={primaryBtn}>
                {actionMut.isPending ? "Working…" : "Open"}
              </button>
              <button type="button" onClick={() => setConfirmAction("cancel")} disabled={actionMut.isPending} className={secondaryBtn}>
                Cancel session
              </button>
            </>
          )}
          {data.status === "OPEN" && (
            <button type="button" onClick={() => setConfirmAction("close")} disabled={actionMut.isPending} className={secondaryBtn}>
              Close session
            </button>
          )}
          {(data.status === "CLOSED" || data.status === "CANCELLED") && (
            <p className="text-sm font-medium text-[#6B7280]">
              {data.status === "CLOSED" ? "This session is closed (read-only)." : "This session is cancelled (read-only)."}
            </p>
          )}
        </div>
      </div>

      {/* Participants (FE8c). */}
      <ParticipantsManager sessionId={data.id} sessionStatus={data.status} />

      {/* Confirm for close/cancel (irreversible-ish actions). */}
      <ConfirmDialog
        open={confirmAction !== null}
        titleId="session-action-title"
        title={confirmAction === "close" ? "Close this session?" : "Cancel this session?"}
        description={
          confirmAction === "close"
            ? "Closing ends the session. Students can no longer start attempts. This cannot be undone."
            : "Cancelling withdraws the session. This cannot be undone."
        }
        confirmLabel={confirmAction === "close" ? "Close session" : "Cancel session"}
        cancelLabel="Keep session"
        busy={actionMut.isPending}
        busyLabel="Working…"
        onConfirm={onConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function ConfigForm({ session }: { session: ExamSessionDetailResponse }) {
  const queryClient = useQueryClient();
  const updateMut = useUpdateSessionMutation(session.id);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSessionValues>({
    resolver: zodResolver(updateSessionSchema),
    defaultValues: {
      title: session.title,
      startsAt: isoToDatetimeLocal(session.startsAt),
      endsAt: isoToDatetimeLocal(session.endsAt),
      maxAttempts: session.maxAttempts,
    },
  });

  const onSubmit = async (values: UpdateSessionValues) => {
    setFormError(null);
    const req: UpdateExamSessionRequest = {
      expectedVersion: session.version ?? 0, // JPA @Version optimistic token.
      title: values.title.trim(),
      // datetime-local (local) → ISO UTC. Submit handler, not render.
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      maxAttempts: values.maxAttempts,
    };
    try {
      await updateMut.mutateAsync(req);
      // mutation onSuccess invalidates → detail refetch → DetailView re-renders
      // with the bumped version → ConfigForm remounts (key=version) with fresh defaults.
    } catch (err) {
      const m = describeConfigError(err);
      if (m.field) setError(m.field, { message: m.message });
      else setFormError(m.message);
      if (m.conflict) queryClient.invalidateQueries({ queryKey: ["exam-sessions", session.id, "detail"] });
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="mb-6 rounded-container bg-[#E0E5EC] p-6 shadow-extruded">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Configuration</h2>

      {formError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="cfg-title" className={labelClass}>Title</label>
          <input id="cfg-title" type="text" aria-invalid={!!errors.title} aria-describedby={errors.title ? "cfg-title-error" : undefined} className={`${inputClass} ${errors.title ? "shadow-inset-deep" : ""}`} {...register("title")} />
          <FieldError id="cfg-title-error" message={errors.title?.message} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="cfg-startsAt" className={labelClass}>Starts at</label>
            <input id="cfg-startsAt" type="datetime-local" aria-invalid={!!errors.startsAt} aria-describedby={errors.startsAt ? "cfg-startsAt-error" : undefined} className={`${inputClass} ${errors.startsAt ? "shadow-inset-deep" : ""}`} {...register("startsAt")} />
            <FieldError id="cfg-startsAt-error" message={errors.startsAt?.message} />
          </div>
          <div>
            <label htmlFor="cfg-endsAt" className={labelClass}>Ends at</label>
            <input id="cfg-endsAt" type="datetime-local" aria-invalid={!!errors.endsAt} aria-describedby={errors.endsAt ? "cfg-endsAt-error" : undefined} className={`${inputClass} ${errors.endsAt ? "shadow-inset-deep" : ""}`} {...register("endsAt")} />
            <FieldError id="cfg-endsAt-error" message={errors.endsAt?.message} />
          </div>
        </div>
        <div>
          <label htmlFor="cfg-maxAttempts" className={labelClass}>Max attempts</label>
          <input id="cfg-maxAttempts" type="number" min={1} step={1} aria-invalid={!!errors.maxAttempts} aria-describedby={errors.maxAttempts ? "cfg-maxAttempts-error" : undefined} className={`${inputClass} ${errors.maxAttempts ? "shadow-inset-deep" : ""}`} {...register("maxAttempts", { valueAsNumber: true })} />
          <FieldError id="cfg-maxAttempts-error" message={errors.maxAttempts?.message} />
        </div>
        <button type="submit" disabled={isSubmitting} className={primaryBtn}>{isSubmitting ? "Saving…" : "Save configuration"}</button>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#3D4852]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      {message}
    </p>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading session" className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-2xl bg-[#E0E5EC] shadow-inset-small" />
      <div className="h-64 animate-pulse rounded-container bg-[#E0E5EC] shadow-extruded" />
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
      <p className="font-display text-lg font-bold text-[#3D4852]">Session not found</p>
      <p className="mt-1 text-sm text-[#6B7280]">This session may have been removed or you don&apos;t have access to it.</p>
      <Link href="/exam-sessions" className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
        Back to sessions
      </Link>
    </div>
  );
}

function LoadError({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "EXAM_SESSION_NOT_FOUND":
        message = "This session could not be found.";
        break;
      case "EXAM_SESSION_ACCESS_DENIED":
      case "EXAM_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to this session.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load the session.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection and try again.";
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
        <Link href="/exam-sessions" className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
          Back to sessions
        </Link>
      </div>
    </div>
  );
}
