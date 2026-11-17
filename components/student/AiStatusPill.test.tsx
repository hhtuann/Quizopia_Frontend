// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiStatusPill } from "./AiStatusPill";
import type { AttemptAiState } from "@/lib/ai/use-attempt-ai-detection";

/** P4-C: the attempt-header AI pill — neutral VN labels per CONTRACT §6,
 * informational only (role="status"), hidden once released, SIMULATED
 * suffix while the e2e fake detector is active. NO detections shown. */

afterEach(cleanup);

function state(partial: Partial<AttemptAiState>): AttemptAiState {
  return {
    status: "running",
    gaze: "off",
    runtime: null,
    fps: 1.5,
    simulated: false,
    snapshotState: "idle",
    ...partial,
  };
}

function pillText(partial: Partial<AttemptAiState>): string {
  const { container } = render(<AiStatusPill state={state(partial)} />);
  return container.querySelector('[data-testid="ai-status-pill"]')?.textContent ?? "";
}

describe("AiStatusPill", () => {
  it("running shows a plain label — no model, FPS, runtime or source link", () => {
    const text = pillText({ status: "running", runtime: "ORT_WEB_WEBGPU", fps: 1.5, gaze: "running" });
    expect(text).toBe("AI giám sát: đang chạy");
  });

  it("gaze sub-status is appended only while it needs attention — never an observation", () => {
    const base = { status: "running" as const, runtime: "ORT_WEB_WEBGPU" as const, fps: 1.5 };
    expect(pillText({ ...base, gaze: "off" })).not.toContain("hướng nhìn");
    expect(pillText({ ...base, gaze: "loading" })).toContain("hướng nhìn: đang tải…");
    expect(pillText({ ...base, gaze: "calibrating" })).toContain(
      "hướng nhìn: đang lấy mốc, hãy nhìn vào màn hình"
    );
    expect(pillText({ ...base, gaze: "running" })).not.toContain("hướng nhìn");
    expect(pillText({ ...base, gaze: "unavailable" })).toContain("hướng nhìn: không khả dụng");
  });

  it("degraded stays informational — analysis continues", () => {
    expect(pillText({ status: "degraded" })).toContain(
      "AI giám sát: đang chạy — sự kiện chưa gửi được"
    );
  });

  it("loading shows the model-loading label", () => {
    expect(pillText({ status: "loading" })).toContain("đang tải mô hình…");
  });

  it("unavailable spells out that answering is unaffected", () => {
    expect(pillText({ status: "unavailable" })).toContain(
      "không khả dụng (không ảnh hưởng bài làm)"
    );
  });

  it("idle shows the waiting-for-camera label", () => {
    expect(pillText({ status: "idle" })).toContain("đang chờ camera…");
  });

  it("renders nothing once released", () => {
    const { container } = render(<AiStatusPill state={state({ status: "released" })} />);
    expect(container.querySelector('[data-testid="ai-status-pill"]')).toBeNull();
  });

  it("appends the SIMULATED marker while the fake detector is active", () => {
    expect(pillText({ status: "running", simulated: true })).toContain("[SIMULATED]");
  });

  it("appends the transient snapshot-sent suffix only after a successful upload", () => {
    expect(pillText({ snapshotState: "sent" })).toContain("Đã gửi ảnh minh chứng");
    expect(pillText({ snapshotState: "idle" })).not.toContain("Đã gửi ảnh minh chứng");
    expect(pillText({ snapshotState: "failed" })).not.toContain("Đã gửi ảnh minh chứng");
  });

  it("keeps the SIMULATED marker independent of the snapshot suffix", () => {
    const text = pillText({ simulated: true, snapshotState: "sent" });
    expect(text).toContain("[SIMULATED]");
    expect(text).toContain("Đã gửi ảnh minh chứng");
  });

  it("is a polite status (never an alert)", () => {
    render(<AiStatusPill state={state({})} />);
    const el = document.querySelector('[data-testid="ai-status-pill"]')!;
    expect(el.getAttribute("role")).toBe("status");
  });
});
