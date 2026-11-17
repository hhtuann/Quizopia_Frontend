"use client";

import { cn } from "@/lib/utils/cn";
import type {
  AttemptAiState,
  AttemptGazeStatus,
} from "@/lib/ai/use-attempt-ai-detection";

/**
 * AI proctoring status pill for the attempt header (P4-C) — sits beside the
 * camera pill. Informational ONLY, neutral copy, NO detections shown to the
 * student (CONTRACT §6); the AI pipeline can never block answering, so the
 * unavailable state spells that out. Renders nothing once released.
 */

/** Gaze sub-status suffix — neutral, never shows what was observed. Nothing
 * extra once gaze is running normally (the pill stays a plain "đang chạy"). */
const GAZE_LABEL: Record<AttemptGazeStatus, string> = {
  off: "",
  loading: " · hướng nhìn: đang tải…",
  calibrating: " · hướng nhìn: đang lấy mốc, hãy nhìn vào màn hình",
  running: "",
  unavailable: " · hướng nhìn: không khả dụng",
};

interface PillView {
  label: string;
  dot: string;
  text: string;
}

function pillView(state: AttemptAiState): PillView {
  switch (state.status) {
    case "running":
      return {
        label: `AI giám sát: đang chạy${GAZE_LABEL[state.gaze] ?? ""}`,
        dot: "bg-[#10B981]",
        text: "text-[#10B981]",
      };
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
      {state.snapshotState === "sent" ? " · Đã gửi ảnh minh chứng" : ""}
      {" · "}
      <a
        href="https://github.com/hhtuann/Quizopia_Frontend/blob/main/SOURCE-AVAILABILITY.md"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
        aria-label="Mã nguồn và giấy phép AGPL-3.0 của Quizopia"
      >
        Mã nguồn
      </a>
    </span>
  );
}
