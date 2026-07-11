"use client";

import { useEffect, useState } from "react";
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
import { Badge, Button, Input, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { ClassAssignment } from "@/components/teacher/ClassAssignment";
import { LiveMonitor } from "@/components/teacher/LiveMonitor";
import { ReportingSection } from "@/components/teacher/reporting/ReportingSection";
import type { NormalizedApiError } from "@/lib/api";

const EDITABLE_STATES: ExamSessionStatus[] = ["DRAFT", "SCHEDULED"];

const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";

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

function statusVariant(status: ExamSessionStatus): "success" | "accent" | "warn" | "default" {
  switch (status) {
    case "OPEN":
      return "success";
    case "SCHEDULED":
      return "accent";
    case "DRAFT":
      return "warn";
    default:
      return "default";
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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

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
    { label: "Exam", value: `${data.examCode ?? "#" + data.examId} · Version ${data.examVersionNumber}` },
    { label: "Opened at", value: formatDateTime(data.openedAt) },
    { label: "Closed at", value: formatDateTime(data.closedAt) },
    { label: "Participants", value: String(data.participantCount) },
    { label: "Version token", value: data.version != null ? String(data.version) : "—" },
    { label: "Created", value: formatDateTime(data.createdAt) },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link href="/exam-sessions" className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">{data.title}</h1>
          <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
          <Badge variant={data.visibility === "PUBLIC" ? "accent" : "default"}>
            {data.visibility === "PUBLIC" ? "Public" : "Class-restricted"}
          </Badge>
        </div>
      </div>

      {notice && (
        <div
          role={notice.kind === "success" ? "status" : "alert"}
          className={cn(
            "mb-6 flex items-start gap-2 rounded-lg border p-4 text-sm font-medium",
            notice.kind === "success"
              ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
              : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
          )}
        >
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
        <div className={cn(cardVariants(), "mb-6 p-6")}>
          <p className="text-sm font-medium text-[#64748B]">
            Configuration is locked — the session is <span className="font-semibold text-[#0F172A]">{data.status}</span>.
          </p>
        </div>
      )}

      {/* Read-only facts */}
      <div className={cn(cardVariants(), "mb-6 p-6")}>
        <h2 className="mb-4 font-display text-lg font-bold tracking-tight text-[#0F172A]">Session details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map((r) => (
            <div key={r.label} className="flex flex-col">
              <dt className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">{r.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-[#0F172A]">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-xs font-medium text-[#64748B]">
          Class access is managed in the section below.
        </p>
      </div>

      {/* Lifecycle — state-gated buttons. */}
      <div className={cn(cardVariants(), "mb-6 p-6")}>
        <h2 className="mb-4 font-display text-lg font-bold tracking-tight text-[#0F172A]">Lifecycle</h2>
        <div className="flex flex-col gap-3">
          {data.status === "DRAFT" && (
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => runAction("schedule")} disabled={actionMut.isPending}>
                {actionMut.isPending ? "Working…" : "Schedule"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmAction("cancel")} disabled={actionMut.isPending}>
                Cancel session
              </Button>
            </div>
          )}
          {data.status === "SCHEDULED" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[#64748B]">This session will open automatically when the start time arrives.</p>
              <Button type="button" variant="outline" onClick={() => setConfirmAction("cancel")} disabled={actionMut.isPending} className="self-start">
                Cancel session
              </Button>
            </div>
          )}
          {data.status === "OPEN" && (
            <Button type="button" variant="outline" onClick={() => setConfirmAction("close")} disabled={actionMut.isPending}>
              Close session
            </Button>
          )}
          {(data.status === "CLOSED" || data.status === "CANCELLED") && (
            <p className="text-sm font-medium text-[#64748B]">
              {data.status === "CLOSED" ? "This session is closed (read-only)." : "This session is cancelled (read-only)."}
            </p>
          )}
        </div>
      </div>

      {/* Participants (FE8c). */}
      {/* Live monitoring (FE14) — WS real-time; only shown when monitoring is
          meaningful (OPEN or recently active). Uses participantCount as the
          baseline for metrics; WS events update from there. */}
      <LiveMonitor
        sessionId={data.id}
        initial={{
          activeCount: 0,
          startedCount: 0,
          submittedCount: 0,
          sessionStatus: data.status,
        }}
      />

      {/* Results & statistics (FE15b) */}
      <ReportingSection sessionId={data.id} />

      <div className="mt-6">
        <ClassAssignment sessionId={data.id} visibility={data.visibility} />
      </div>

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
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!formSuccess) return;
    const t = setTimeout(() => setFormSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [formSuccess]);

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
    setFormSuccess(null);
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
      setFormSuccess("Configuration saved.");
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
    <form noValidate onSubmit={handleSubmit(onSubmit)} className={cn(cardVariants(), "mb-6 p-6")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">Configuration</h2>
        <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save configuration"}</Button>
      </div>

      {formError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}
      {formSuccess && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm font-medium text-[#10B981]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span>{formSuccess}</span>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="cfg-title" className={labelClass}>Title</label>
          <Input id="cfg-title" type="text" aria-invalid={!!errors.title} aria-describedby={errors.title ? "cfg-title-error" : undefined} className={cn(errors.title && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("title")} />
          <FieldError id="cfg-title-error" message={errors.title?.message} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="cfg-startsAt" className={labelClass}>Starts at</label>
            <Input id="cfg-startsAt" type="datetime-local" aria-invalid={!!errors.startsAt} aria-describedby={errors.startsAt ? "cfg-startsAt-error" : undefined} className={cn(errors.startsAt && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("startsAt")} />
            <FieldError id="cfg-startsAt-error" message={errors.startsAt?.message} />
          </div>
          <div>
            <label htmlFor="cfg-endsAt" className={labelClass}>Ends at</label>
            <Input id="cfg-endsAt" type="datetime-local" aria-invalid={!!errors.endsAt} aria-describedby={errors.endsAt ? "cfg-endsAt-error" : undefined} className={cn(errors.endsAt && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("endsAt")} />
            <FieldError id="cfg-endsAt-error" message={errors.endsAt?.message} />
          </div>
        </div>
        <div>
          <label htmlFor="cfg-maxAttempts" className={labelClass}>Max attempts</label>
          <Input id="cfg-maxAttempts" type="number" min={1} step={1} aria-invalid={!!errors.maxAttempts} aria-describedby={errors.maxAttempts ? "cfg-maxAttempts-error" : undefined} className={cn(errors.maxAttempts && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("maxAttempts", { valueAsNumber: true })} />
          <FieldError id="cfg-maxAttempts-error" message={errors.maxAttempts?.message} />
        </div>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#EF4444]">
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
      <div className="h-8 w-64 animate-pulse rounded-lg bg-[#F1F5F9]" />
      <div className="h-64 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]" />
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
      <p className="font-display text-lg font-bold text-[#0F172A]">Session not found</p>
      <p className="mt-1 text-sm text-[#64748B]">This session may have been removed or you don&apos;t have access to it.</p>
      <Link href="/exam-sessions" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
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
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <div>
        <span>{message}</span>
        <Link href="/exam-sessions" className="mt-3 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
          Back to sessions
        </Link>
      </div>
    </div>
  );
}
