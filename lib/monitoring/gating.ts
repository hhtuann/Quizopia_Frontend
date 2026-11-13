import type {
  MonitoringPolicyPayload,
  MonitoringPolicyResponse,
} from "@/lib/api/monitoring";

/**
 * Pure monitoring-config gating logic (Phase 4-A) — extracted so the create
 * and edit forms stay thin and the rules are unit-testable.
 *
 * Frozen rules (ADR-008 / backend SessionMonitoringPolicyService):
 *   - monitoringEnabled requires visibility = CLASS_RESTRICTED AND >= 1
 *     assigned class;
 *   - every advanced flag requires monitoringEnabled;
 *   - evidenceSnapshots additionally requires aiDetectionEnabled;
 *   - evidenceClips additionally requires fullRecordingEnabled;
 *   - fullRecording is OFF by default (D4);
 *   - retention is fixed (30 / 90 days) — not teacher-configurable in P4-A.
 */

/** The six teacher-editable flags (cameraRequired is derived, never stored). */
export interface MonitoringConfigState {
  monitoringEnabled: boolean;
  aiDetectionEnabled: boolean;
  activityTrackingEnabled: boolean;
  evidenceSnapshotsEnabled: boolean;
  fullRecordingEnabled: boolean;
  evidenceClipsEnabled: boolean;
}

/** All flags OFF (create-form default; monitoring is opt-in). */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfigState = {
  monitoringEnabled: false,
  aiDetectionEnabled: false,
  activityTrackingEnabled: false,
  evidenceSnapshotsEnabled: false,
  fullRecordingEnabled: false,
  evidenceClipsEnabled: false,
};

/** Form state from a server `MonitoringPolicyResponse` (edit form defaults). */
export function monitoringConfigFromPolicy(
  policy: MonitoringPolicyResponse | null | undefined
): MonitoringConfigState {
  if (!policy) return { ...DEFAULT_MONITORING_CONFIG };
  return {
    monitoringEnabled: policy.monitoringEnabled,
    aiDetectionEnabled: policy.aiDetectionEnabled,
    activityTrackingEnabled: policy.activityTrackingEnabled,
    evidenceSnapshotsEnabled: policy.evidenceSnapshotsEnabled,
    fullRecordingEnabled: policy.fullRecordingEnabled,
    evidenceClipsEnabled: policy.evidenceClipsEnabled,
  };
}

/**
 * Cascade-normalize a config so it always satisfies the prerequisite chain:
 * monitoring OFF → everything OFF; AI OFF → snapshots OFF; recording OFF →
 * clips OFF. Applied on every change so a saved payload can never hit
 * 400 EXAM_SESSION_MONITORING_INVALID through the form.
 */
export function normalizeMonitoringConfig(
  config: MonitoringConfigState
): MonitoringConfigState {
  if (!config.monitoringEnabled) return { ...DEFAULT_MONITORING_CONFIG };
  return {
    monitoringEnabled: true,
    aiDetectionEnabled: config.aiDetectionEnabled,
    activityTrackingEnabled: config.activityTrackingEnabled,
    evidenceSnapshotsEnabled:
      config.evidenceSnapshotsEnabled && config.aiDetectionEnabled,
    fullRecordingEnabled: config.fullRecordingEnabled,
    evidenceClipsEnabled:
      config.evidenceClipsEnabled && config.fullRecordingEnabled,
  };
}

/**
 * Section-level visibility/class gating: monitoring controls are only
 * available for CLASS_RESTRICTED sessions with at least one selected class.
 */
export function monitoringEligibility(
  visibility: string,
  selectedClassCount: number
): { available: boolean; reason: string | null } {
  if (visibility !== "CLASS_RESTRICTED") {
    return {
      available: false,
      reason:
        "Monitoring is only available for class-restricted sessions. Switch visibility to Class-restricted to enable it.",
    };
  }
  if (selectedClassCount < 1) {
    return {
      available: false,
      reason:
        "Monitoring needs at least one assigned class — select a class above to enable it.",
    };
  }
  return { available: true, reason: null };
}

/** Editable flag ids in display order. */
export const MONITORING_ADVANCED_FLAGS = [
  "aiDetectionEnabled",
  "activityTrackingEnabled",
  "evidenceSnapshotsEnabled",
  "fullRecordingEnabled",
  "evidenceClipsEnabled",
] as const;

export type MonitoringFlagId =
  | "monitoringEnabled"
  | (typeof MONITORING_ADVANCED_FLAGS)[number];

/**
 * Per-flag availability given the CURRENT config: a flag is disabled when its
 * prerequisite is off (AI/activity → monitoring; snapshots → AI; clips →
 * recording). Returns the prerequisite flag id for the disabled explanation.
 */
export function monitoringFlagAvailability(
  config: MonitoringConfigState
): Record<
  MonitoringFlagId,
  { disabled: boolean; prerequisite?: MonitoringFlagId }
> {
  return {
    monitoringEnabled: { disabled: false },
    aiDetectionEnabled: {
      disabled: !config.monitoringEnabled,
      prerequisite: "monitoringEnabled",
    },
    activityTrackingEnabled: {
      disabled: !config.monitoringEnabled,
      prerequisite: "monitoringEnabled",
    },
    evidenceSnapshotsEnabled: {
      disabled: !config.monitoringEnabled || !config.aiDetectionEnabled,
      prerequisite: "aiDetectionEnabled",
    },
    fullRecordingEnabled: {
      disabled: !config.monitoringEnabled,
      prerequisite: "monitoringEnabled",
    },
    evidenceClipsEnabled: {
      disabled: !config.monitoringEnabled || !config.fullRecordingEnabled,
      prerequisite: "fullRecordingEnabled",
    },
  };
}

/**
 * Build the request block: the form ALWAYS sends the full set of flags so a
 * non-null `monitoring` replaces the whole server-side block predictably.
 */
export function buildMonitoringPayload(
  config: MonitoringConfigState
): MonitoringPolicyPayload {
  return {
    monitoringEnabled: config.monitoringEnabled,
    aiDetectionEnabled: config.aiDetectionEnabled,
    activityTrackingEnabled: config.activityTrackingEnabled,
    evidenceSnapshotsEnabled: config.evidenceSnapshotsEnabled,
    fullRecordingEnabled: config.fullRecordingEnabled,
    evidenceClipsEnabled: config.evidenceClipsEnabled,
  };
}

/** Retention copy: "Evidence retained 30 days · activity 90 days". */
export function monitoringRetentionLine(
  policy: MonitoringPolicyResponse | null | undefined
): string {
  const media = policy?.mediaRetentionDays ?? 30;
  const activity = policy?.activityRetentionDays ?? 90;
  return `Evidence retained ${media} days · activity ${activity} days`;
}
