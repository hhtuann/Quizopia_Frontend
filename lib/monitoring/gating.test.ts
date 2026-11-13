import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONITORING_CONFIG,
  buildMonitoringPayload,
  monitoringConfigFromPolicy,
  monitoringEligibility,
  monitoringFlagAvailability,
  monitoringRetentionLine,
  normalizeMonitoringConfig,
  type MonitoringConfigState,
} from "./gating";
import type { MonitoringPolicyResponse } from "@/lib/api/monitoring";

function config(
  overrides: Partial<MonitoringConfigState>
): MonitoringConfigState {
  return { ...DEFAULT_MONITORING_CONFIG, ...overrides };
}

function policy(
  overrides: Partial<MonitoringPolicyResponse>
): MonitoringPolicyResponse {
  return {
    monitoringEnabled: false,
    cameraRequired: false,
    aiDetectionEnabled: false,
    activityTrackingEnabled: false,
    evidenceSnapshotsEnabled: false,
    fullRecordingEnabled: false,
    evidenceClipsEnabled: false,
    configurationFrozen: false,
    mediaRetentionDays: 30,
    activityRetentionDays: 90,
    ...overrides,
  };
}

describe("monitoringEligibility (section gating)", () => {
  it("is available only for CLASS_RESTRICTED with >= 1 class", () => {
    expect(monitoringEligibility("CLASS_RESTRICTED", 1).available).toBe(true);
    expect(monitoringEligibility("CLASS_RESTRICTED", 3).reason).toBeNull();
  });

  it("explains PUBLIC visibility", () => {
    const gate = monitoringEligibility("PUBLIC", 2);
    expect(gate.available).toBe(false);
    expect(gate.reason).toMatch(/class-restricted/i);
  });

  it("explains zero classes", () => {
    const gate = monitoringEligibility("CLASS_RESTRICTED", 0);
    expect(gate.available).toBe(false);
    expect(gate.reason).toMatch(/at least one assigned class/i);
  });
});

describe("normalizeMonitoringConfig (cascade)", () => {
  it("turning monitoring off clears every advanced flag", () => {
    const next = normalizeMonitoringConfig(
      config({
        monitoringEnabled: false,
        aiDetectionEnabled: true,
        fullRecordingEnabled: true,
        evidenceClipsEnabled: true,
      })
    );
    expect(next).toEqual(DEFAULT_MONITORING_CONFIG);
  });

  it("snapshots fall when AI falls; clips fall when recording falls", () => {
    expect(
      normalizeMonitoringConfig(
        config({
          monitoringEnabled: true,
          aiDetectionEnabled: false,
          evidenceSnapshotsEnabled: true,
          fullRecordingEnabled: false,
          evidenceClipsEnabled: true,
        })
      )
    ).toEqual(
      config({
        monitoringEnabled: true,
        activityTrackingEnabled: false,
      })
    );
  });

  it("valid prerequisite chains survive normalization untouched", () => {
    const valid = config({
      monitoringEnabled: true,
      aiDetectionEnabled: true,
      evidenceSnapshotsEnabled: true,
      fullRecordingEnabled: true,
      evidenceClipsEnabled: true,
    });
    expect(normalizeMonitoringConfig(valid)).toEqual(valid);
  });
});

describe("monitoringFlagAvailability (per-flag prerequisites)", () => {
  it("everything depends on monitoringEnabled first", () => {
    const availability = monitoringFlagAvailability(DEFAULT_MONITORING_CONFIG);
    expect(availability.monitoringEnabled.disabled).toBe(false);
    expect(availability.aiDetectionEnabled.disabled).toBe(true);
    expect(availability.aiDetectionEnabled.prerequisite).toBe("monitoringEnabled");
    expect(availability.activityTrackingEnabled.disabled).toBe(true);
    expect(availability.fullRecordingEnabled.disabled).toBe(true);
  });

  it("snapshots additionally need AI; clips additionally need recording", () => {
    const availability = monitoringFlagAvailability(
      config({ monitoringEnabled: true })
    );
    expect(availability.evidenceSnapshotsEnabled.disabled).toBe(true);
    expect(availability.evidenceSnapshotsEnabled.prerequisite).toBe("aiDetectionEnabled");
    expect(availability.evidenceClipsEnabled.disabled).toBe(true);
    expect(availability.evidenceClipsEnabled.prerequisite).toBe("fullRecordingEnabled");

    const withPrereqs = monitoringFlagAvailability(
      config({ monitoringEnabled: true, aiDetectionEnabled: true, fullRecordingEnabled: true })
    );
    expect(withPrereqs.evidenceSnapshotsEnabled.disabled).toBe(false);
    expect(withPrereqs.evidenceClipsEnabled.disabled).toBe(false);
    expect(withPrereqs.aiDetectionEnabled.disabled).toBe(false);
  });
});

describe("payload + policy mapping", () => {
  it("always sends the FULL block (non-null replaces the server block)", () => {
    expect(buildMonitoringPayload(DEFAULT_MONITORING_CONFIG)).toEqual({
      monitoringEnabled: false,
      aiDetectionEnabled: false,
      activityTrackingEnabled: false,
      evidenceSnapshotsEnabled: false,
      fullRecordingEnabled: false,
      evidenceClipsEnabled: false,
    });
    expect(
      buildMonitoringPayload(config({ monitoringEnabled: true, aiDetectionEnabled: true }))
        .aiDetectionEnabled
    ).toBe(true);
  });

  it("maps a server policy to form state (edit defaults)", () => {
    expect(monitoringConfigFromPolicy(null)).toEqual(DEFAULT_MONITORING_CONFIG);
    expect(monitoringConfigFromPolicy(undefined)).toEqual(DEFAULT_MONITORING_CONFIG);
    expect(
      monitoringConfigFromPolicy(
        policy({ monitoringEnabled: true, activityTrackingEnabled: true })
      )
    ).toEqual(config({ monitoringEnabled: true, activityTrackingEnabled: true }));
  });
});

describe("retention copy", () => {
  it("renders the fixed retention line with policy overrides", () => {
    expect(monitoringRetentionLine(policy({}))).toBe(
      "Evidence retained 30 days · activity 90 days"
    );
    expect(
      monitoringRetentionLine(policy({ mediaRetentionDays: 14, activityRetentionDays: 60 }))
    ).toBe("Evidence retained 14 days · activity 60 days");
    expect(monitoringRetentionLine(null)).toBe(
      "Evidence retained 30 days · activity 90 days"
    );
  });
});
