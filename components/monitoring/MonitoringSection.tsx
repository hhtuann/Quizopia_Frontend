"use client";

import { Badge, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  monitoringFlagAvailability,
  monitoringRetentionLine,
  type MonitoringConfigState,
  type MonitoringFlagId,
} from "@/lib/monitoring/gating";
import type { MonitoringPolicyResponse } from "@/lib/api/monitoring";

const CAMERA_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);

const ADVANCED_OPTIONS: {
  id: Exclude<MonitoringFlagId, "monitoringEnabled">;
  label: string;
  hint: string;
}[] = [
  {
    id: "aiDetectionEnabled",
    label: "AI detection",
    hint: "Flag suspicious patterns automatically",
  },
  {
    id: "activityTrackingEnabled",
    label: "Activity tracking",
    hint: "Record tab/focus/navigation activity",
  },
  {
    id: "evidenceSnapshotsEnabled",
    label: "Evidence snapshots",
    hint: "Requires AI detection",
  },
  {
    id: "fullRecordingEnabled",
    label: "Full recording",
    hint: "Off by default — heavy storage",
  },
  {
    id: "evidenceClipsEnabled",
    label: "Evidence clips",
    hint: "Requires full recording",
  },
];

/**
 * "Exam monitoring" config card (Phase 4-A) — shared by the session create
 * form and the edit ConfigForm. Controlled: the parent owns the config state
 * (normalized via `normalizeMonitoringConfig`) and sends the full block on
 * create/update. Pure gating rules live in `lib/monitoring/gating`.
 *
 * Section gating: pass `unavailableReason` (from `monitoringEligibility`)
 * when visibility/classes don't qualify — the card renders disabled with the
 * explanation. `frozen` renders the edit-time readonly notice.
 */
export function MonitoringSection({
  config,
  onConfigChange,
  unavailableReason = null,
  frozen = false,
  policy,
}: {
  config: MonitoringConfigState;
  onConfigChange: (next: MonitoringConfigState) => void;
  /** Non-null → all controls disabled with this explanation. */
  unavailableReason?: string | null;
  /** Edit-time derived freeze (readonly + notice). */
  frozen?: boolean;
  /** Server policy (retention copy). */
  policy?: MonitoringPolicyResponse | null;
}) {
  const availability = monitoringFlagAvailability(config);
  const controlsDisabled = unavailableReason != null || frozen;

  const toggle = (id: MonitoringFlagId, value: boolean) => {
    if (controlsDisabled || availability[id].disabled) return;
    onConfigChange({ ...config, [id]: value });
  };

  return (
    <section
      aria-label="Exam monitoring"
      className={cn(cardVariants(), "p-6")}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          Exam monitoring
        </h3>
        {config.monitoringEnabled && (
          <Badge variant="accent" className="gap-1.5">
            {CAMERA_ICON}
            Camera required
          </Badge>
        )}
      </div>
      <p className="text-xs font-medium text-[#64748B]">
        Monitoring makes this a proctored session: students get a camera-check
        notice and their activity is recorded for review.
      </p>

      {frozen && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3 text-sm font-medium text-[#0F172A]"
        >
          Monitoring configuration is <span className="font-semibold">frozen</span> —
          the session has opened, started, or already has attempts. It can no
          longer be changed.
        </p>
      )}

      {!frozen && unavailableReason != null && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-3 text-sm font-medium text-[#64748B]"
        >
          {unavailableReason}
        </p>
      )}

      <label
        className={cn(
          "mt-4 flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm outline-none transition-all duration-200 focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2",
          controlsDisabled
            ? "cursor-not-allowed border-[#E2E8F0] bg-[#F1F5F9]/60 text-[#94A3B8]"
            : config.monitoringEnabled
            ? "border-[#0052FF] bg-[#0052FF]/5"
            : "border-[#E2E8F0] bg-white hover:bg-[#F1F5F9]"
        )}
      >
        <input
          type="checkbox"
          checked={config.monitoringEnabled}
          disabled={controlsDisabled}
          onChange={(e) => toggle("monitoringEnabled", e.target.checked)}
          className="h-4 w-4 accent-[#0052FF]"
        />
        <span className="min-w-0">
          <span className="block font-semibold text-[#0F172A]">
            Enable exam monitoring
          </span>
          <span className="block text-xs font-medium text-[#64748B]">
            Camera verification + activity timeline for every attempt
          </span>
        </span>
      </label>

      {config.monitoringEnabled && (
        <fieldset className="mt-4" disabled={controlsDisabled}>
          <legend className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
            Advanced options
          </legend>
          <div className="grid grid-cols-1 gap-2">
            {ADVANCED_OPTIONS.map((opt) => {
              const { disabled } = availability[opt.id];
              const checked = config[opt.id];
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-[#0052FF] focus-within:ring-offset-2",
                    disabled
                      ? "cursor-not-allowed border-[#E2E8F0] bg-[#F1F5F9]/60 text-[#94A3B8]"
                      : checked
                      ? "cursor-pointer border-[#0052FF] bg-[#0052FF]/5"
                      : "cursor-pointer border-[#E2E8F0] bg-white hover:bg-[#F1F5F9]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={controlsDisabled || disabled}
                    onChange={(e) => toggle(opt.id, e.target.checked)}
                    className="h-4 w-4 accent-[#0052FF]"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#0F172A]">
                      {opt.label}
                    </span>
                    <span className="block text-xs font-medium text-[#64748B]">
                      {disabled
                        ? `${opt.hint} — enable it first`
                        : opt.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <p className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-xs font-medium text-[#64748B]">
        {monitoringRetentionLine(policy)}
      </p>
    </section>
  );
}
