import type {
  CreateExamSessionRequest,
  UpdateExamSessionRequest,
} from "@/lib/api/exam-sessions";
import type {
  CreateSessionValues,
  UpdateSessionValues,
} from "@/lib/validation/exam-session-schemas";
import {
  DEFAULT_MONITORING_CONFIG,
  buildMonitoringPayload,
  type MonitoringConfigState,
} from "@/lib/monitoring/gating";

/**
 * Pure create/update payload builders for the session config forms
 * (extracted from the pages for regression testing).
 *
 *  - create ALWAYS carries `visibility` (absent ⇒ backend defaults to
 *    CLASS_RESTRICTED — a Public selection must never be dropped, FE-1);
 *  - monitoring is only submitted while the section is eligible — a
 *    previously-enabled config left in state when the teacher switches to
 *    PUBLIC / clears classes must be sent as all-off, never stale-on (FE-2);
 *  - update OMITS the monitoring block entirely while the server policy is
 *    frozen — the backend's "absent block = no change" affordance keeps
 *    title-only saves working in a frozen-but-editable window (FE-5).
 */

export function buildCreateSessionPayload(
  values: CreateSessionValues,
  selectedClassIds: number[],
  monitoring: MonitoringConfigState,
  monitoringAvailable: boolean
): Omit<CreateExamSessionRequest, "examId"> {
  return {
    title: values.title.trim(),
    // datetime-local (local) → ISO UTC.
    startsAt: new Date(values.startsAt).toISOString(),
    endsAt: new Date(values.endsAt).toISOString(),
    maxAttempts: values.maxAttempts,
    durationMinutes: values.durationMinutes,
    visibility: values.visibility,
    classroomIds:
      values.visibility === "CLASS_RESTRICTED" ? selectedClassIds : [],
    monitoring: buildMonitoringPayload(
      monitoringAvailable ? monitoring : DEFAULT_MONITORING_CONFIG
    ),
  };
}

export function buildUpdateSessionPayload(
  values: UpdateSessionValues,
  expectedVersion: number,
  monitoring: MonitoringConfigState,
  monitoringFrozen: boolean
): UpdateExamSessionRequest {
  const base: UpdateExamSessionRequest = {
    expectedVersion,
    title: values.title.trim(),
    // datetime-local (local) → ISO UTC.
    startsAt: new Date(values.startsAt).toISOString(),
    endsAt: new Date(values.endsAt).toISOString(),
    maxAttempts: values.maxAttempts,
  };
  if (monitoringFrozen) return base;
  return { ...base, monitoring: buildMonitoringPayload(monitoring) };
}
