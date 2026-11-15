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
    runtime: null,
    fps: 1.5,
    simulated: false,
    ...partial,
  };
}

function pillText(partial: Partial<AttemptAiState>): string {
  const { container } = render(<AiStatusPill state={state(partial)} />);
  return container.querySelector('[data-testid="ai-status-pill"]')?.textContent ?? "";
}

describe("AiStatusPill", () => {
  it("running shows the yolo26s + FPS + WebGPU runtime label", () => {
    const text = pillText({ status: "running", runtime: "ORT_WEB_WEBGPU", fps: 1.5 });
    expect(text).toContain("AI giám sát: đang chạy (yolo26s, ~1.5FPS, WebGPU)");
  });

  it("running shows WASM when that is the runtime", () => {
    expect(pillText({ status: "running", runtime: "ORT_WEB_WASM", fps: 0.5 })).toContain(
      "~0.5FPS, WASM"
    );
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

  it("is a polite status (never an alert)", () => {
    render(<AiStatusPill state={state({})} />);
    const el = document.querySelector('[data-testid="ai-status-pill"]')!;
    expect(el.getAttribute("role")).toBe("status");
  });
});
