import { describe, expect, it } from "vitest";
import {
  buildCreateSessionPayload,
  buildUpdateSessionPayload,
} from "./session-payloads";
import { DEFAULT_MONITORING_CONFIG, type MonitoringConfigState } from "@/lib/monitoring/gating";
import type { CreateSessionValues } from "@/lib/validation/exam-session-schemas";

function createValues(
  overrides: Partial<CreateSessionValues> = {}
): CreateSessionValues {
  return {
    title: "Midterm",
    startsAt: "2026-07-10T07:00",
    endsAt: "2026-07-10T10:00",
    maxAttempts: 2,
    durationMinutes: 60,
    visibility: "CLASS_RESTRICTED",
    ...overrides,
  };
}

function monitoringOn(): MonitoringConfigState {
  return {
    ...DEFAULT_MONITORING_CONFIG,
    monitoringEnabled: true,
    aiDetectionEnabled: true,
  };
}

describe("buildCreateSessionPayload (FE-1: visibility is never dropped)", () => {
  it("always carries the selected visibility — PUBLIC included", () => {
    const payload = buildCreateSessionPayload(
      createValues({ visibility: "PUBLIC" }),
      [5],
      DEFAULT_MONITORING_CONFIG,
      false
    );
    expect(payload.visibility).toBe("PUBLIC");
    // PUBLIC ignores class selection.
    expect(payload.classroomIds).toEqual([]);
  });

  it("carries CLASS_RESTRICTED with the selected classes", () => {
    const payload = buildCreateSessionPayload(
      createValues(),
      [5, 9],
      DEFAULT_MONITORING_CONFIG,
      true
    );
    expect(payload.visibility).toBe("CLASS_RESTRICTED");
    expect(payload.classroomIds).toEqual([5, 9]);
  });
});

describe("buildCreateSessionPayload (FE-2: no stale monitoring when ineligible)", () => {
  it("PUBLIC + previously-enabled monitoring submits an ALL-OFF block", () => {
    const payload = buildCreateSessionPayload(
      createValues({ visibility: "PUBLIC" }),
      [],
      monitoringOn(), // stale state left in the form
      false // gate unavailable (PUBLIC)
    );
    expect(payload.monitoring).toEqual({
      monitoringEnabled: false,
      aiDetectionEnabled: false,
      activityTrackingEnabled: false,
      evidenceSnapshotsEnabled: false,
      fullRecordingEnabled: false,
      evidenceClipsEnabled: false,
    });
  });

  it("eligible sessions send the full configured block", () => {
    const payload = buildCreateSessionPayload(
      createValues(),
      [5],
      monitoringOn(),
      true
    );
    expect(payload.monitoring?.monitoringEnabled).toBe(true);
    expect(payload.monitoring?.aiDetectionEnabled).toBe(true);
  });
});

describe("buildUpdateSessionPayload (FE-5: frozen omits the monitoring block)", () => {
  const values = {
    title: "Midterm",
    startsAt: "2026-07-10T07:00",
    endsAt: "2026-07-10T10:00",
    maxAttempts: 2,
  };

  it("frozen policy → NO monitoring key (backend treats absent as no-change)", () => {
    const payload = buildUpdateSessionPayload(values, 3, monitoringOn(), true);
    expect("monitoring" in payload).toBe(false);
    expect(payload.title).toBe("Midterm");
    expect(payload.expectedVersion).toBe(3);
  });

  it("editable policy → full monitoring block replaces the server config", () => {
    const payload = buildUpdateSessionPayload(values, 3, monitoringOn(), false);
    expect(payload.monitoring).toBeDefined();
    expect(payload.monitoring?.monitoringEnabled).toBe(true);
  });
});
