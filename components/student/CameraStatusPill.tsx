"use client";

import { cn } from "@/lib/utils/cn";
import type { AttemptCameraStatus } from "@/lib/media/use-attempt-camera";

/**
 * Camera status pill for the attempt header (P4-B) — sits beside the WS
 * indicator. Informational ONLY: camera state never blocks answering.
 * Hidden entirely for unmonitored attempts (status "inactive").
 */

const PILL: Record<
  Exclude<AttemptCameraStatus, "inactive">,
  { label: string; dot: string; text: string }
> = {
  verified: { label: "Camera live", dot: "bg-[#10B981]", text: "text-[#10B981]" },
  connecting: { label: "Camera connecting…", dot: "bg-[#0052FF]", text: "text-[#0052FF]" },
  reconnecting: { label: "Camera reconnecting…", dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
  revoked: { label: "Camera revoked", dot: "bg-[#EF4444]", text: "text-[#EF4444]" },
  unbound: {
    label: "Camera not connected — answers still saved",
    dot: "bg-[#94A3B8]",
    text: "text-[#94A3B8]",
  },
};

export function CameraStatusPill({ status }: { status: AttemptCameraStatus }) {
  if (status === "inactive") return null;
  const { label, dot, text } = PILL[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-[10px] font-semibold", text, status === "reconnecting" && "animate-pulse")}
    >
      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", dot)} />
      {label}
    </span>
  );
}
