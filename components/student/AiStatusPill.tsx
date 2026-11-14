"use client";

import { cn } from "@/lib/utils/cn";
import type { AttemptAiState } from "@/lib/ai/use-attempt-ai-detection";

/**
 * AI proctoring status pill for the attempt header (P4-C) — sits beside the
 * camera pill. Informational ONLY, neutral copy, NO detections shown to the
 * student (CONTRACT §6); the AI pipeline can never block answering, so the
 * unavailable state spells that out. Renders nothing once released.
 */

const RUNTIME_LABEL: Record<string, string> = {
  ORT_WEB_WEBGPU: "WebGPU",
  ORT_WEB_WASM: "WASM",
};

interface PillView {
  label: string;
  dot: string;
  text: string;
}

function pillView(state: AttemptAiState): PillView {
  switch (state.status) {
    case "running": {
      const runtime = state.runtime
        ? RUNTIME_LABEL[state.runtime] ?? state.runtime
        : null;
      const parts = [`~${state.fps}FPS`];
      if (runtime) parts.push(runtime);
      return {
        label: `AI giám sát: đang chạy (yolo26s, ${parts.join(", ")})`,
        dot: "bg-[#10B981]",
        text: "text-[#10B981]",
      };
    }
    case "degraded":
      // Analysis continues; only event delivery is failing.
      return {
        label: "AI giám sát: đang chạy — sự kiện chưa gửi được",
        dot: "bg-[#F59E0B]",
        text: "text-[#F59E0B]",
      };
    case "loading":
      return {
        label: "AI giám sát: đang tải mô hình…",
        dot: "bg-[#0052FF]",
        text: "text-[#0052FF]",
      };
    case "unavailable":
      return {
        label: "AI giám sát: không khả dụng (không ảnh hưởng bài làm)",
        dot: "bg-[#94A3B8]",
        text: "text-[#94A3B8]",
      };
    default: // idle — waiting for the camera publish
      return {
        label: "AI giám sát: đang chờ camera…",
        dot: "bg-[#94A3B8]",
        text: "text-[#94A3B8]",
      };
  }
}

export function AiStatusPill({ state }: { state: AttemptAiState }) {
  if (state.status === "released") return null;
  const { label, dot, text } = pillView(state);
  return (
    <span
      data-testid="ai-status-pill"
      role="status"
      aria-live="polite"
      className={cn(
        "text-[10px] font-semibold",
        text,
        (state.status === "loading" || state.status === "idle") && "animate-pulse"
      )}
    >
      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", dot)} />
      {label}
      {state.simulated ? " [SIMULATED]" : ""}
    </span>
  );
}
