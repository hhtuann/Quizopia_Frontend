// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonitoringSection } from "./MonitoringSection";
import {
  DEFAULT_MONITORING_CONFIG,
  normalizeMonitoringConfig,
  type MonitoringConfigState,
} from "@/lib/monitoring/gating";

/**
 * Presentational interactions on the "Exam monitoring" card. The pure gating
 * rules are covered in lib/monitoring/gating.test.ts — here we verify the
 * card renders/stops them correctly (disabled section, hidden advanced
 * options, frozen state, derived camera badge).
 */

afterEach(cleanup);

function state(overrides: Partial<MonitoringConfigState> = {}): MonitoringConfigState {
  return { ...DEFAULT_MONITORING_CONFIG, ...overrides };
}

describe("MonitoringSection", () => {
  it("hides advanced options and the camera badge until monitoring is enabled", () => {
    render(
      <MonitoringSection config={state()} onConfigChange={() => {}} />
    );
    expect(screen.queryByText("AI detection")).toBeNull();
    expect(screen.queryByText("Camera required")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /enable exam monitoring/i })).toBeTruthy();
  });

  it("shows the camera badge and advanced options once enabled", () => {
    render(
      <MonitoringSection
        config={state({ monitoringEnabled: true })}
        onConfigChange={() => {}}
      />
    );
    expect(screen.getByText("Camera required")).toBeTruthy();
    expect(screen.getByText("AI detection")).toBeTruthy();
    expect(screen.getByText("Full recording")).toBeTruthy();
  });

  it("disables the whole section with an explanation when classes/visibility don't qualify", () => {
    const onConfigChange = vi.fn();
    render(
      <MonitoringSection
        config={state()}
        onConfigChange={onConfigChange}
        unavailableReason="Monitoring needs at least one assigned class."
      />
    );
    expect(screen.getByText("Monitoring needs at least one assigned class.")).toBeTruthy();
    const enable = screen.getByRole("checkbox", { name: /enable exam monitoring/i });
    expect((enable as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(enable);
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("disables prerequisite-gated advanced options and keeps the parent cascade working", () => {
    const onConfigChange = vi.fn();
    render(
      <MonitoringSection
        config={state({ monitoringEnabled: true })}
        onConfigChange={onConfigChange}
      />
    );
    // Snapshots need AI; clips need recording — both disabled here.
    const snapshots = screen.getByRole("checkbox", { name: /evidence snapshots/i });
    const clips = screen.getByRole("checkbox", { name: /evidence clips/i });
    expect((snapshots as HTMLInputElement).disabled).toBe(true);
    expect((clips as HTMLInputElement).disabled).toBe(true);

    // AI is available → clicking it emits the full next config.
    const ai = screen.getByRole("checkbox", { name: /^ai detection/i }) as HTMLInputElement;
    fireEvent.click(ai);
    expect(onConfigChange).toHaveBeenCalledWith(
      state({ monitoringEnabled: true, aiDetectionEnabled: true })
    );
  });

  it("normalizes on change so toggling monitoring off clears advanced flags", () => {
    // Mirrors the form's onConfigChange wiring (create + edit pages).
    let config = state({ monitoringEnabled: true, aiDetectionEnabled: true });
    const next = normalizeMonitoringConfig({ ...config, monitoringEnabled: false });
    config = next;
    expect(config).toEqual(DEFAULT_MONITORING_CONFIG);
  });

  it("renders the frozen notice and disables controls in the frozen state", () => {
    render(
      <MonitoringSection
        config={state({ monitoringEnabled: true, aiDetectionEnabled: true })}
        onConfigChange={() => {}}
        frozen
      />
    );
    expect(screen.getByText(/frozen/i)).toBeTruthy();
    const enable = screen.getByRole("checkbox", { name: /enable exam monitoring/i }) as HTMLInputElement;
    expect(enable.disabled).toBe(true);
    const ai = screen.getByRole("checkbox", { name: /^ai detection/i }) as HTMLInputElement;
    expect(ai.disabled).toBe(true);
  });

  it("renders the retention line from the policy", () => {
    render(
      <MonitoringSection
        config={state()}
        onConfigChange={() => {}}
        policy={{
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
        }}
      />
    );
    expect(screen.getByText("Evidence retained 30 days · activity 90 days")).toBeTruthy();
  });
});
