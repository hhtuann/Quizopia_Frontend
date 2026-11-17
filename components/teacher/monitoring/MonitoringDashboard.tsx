"use client";

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { Badge, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";
import type { NormalizedApiError } from "@/lib/api/errors";
import type { AlertReviewStatus } from "@/lib/api/alert-review";
import {
  DEFAULT_PARTICIPANTS_FILTERS,
  getMonitoringOverview,
  getMonitoringParticipants,
  type MonitoringOverviewResponse,
  type MonitoringParticipantItem,
  type ParticipantCameraState,
  type ParticipantsQueryFilters,
} from "@/lib/api/monitoring-dashboard";
import { formatDateTime, formatTime } from "@/lib/utils/format";

/**
 * P4-E unified monitoring dashboard (design §4) — monitored sessions only,
 * rendered by the session detail above CameraGridCard. Overview KPIs + a
 * cursor-paged participants rollup; a row click selects the attempt for the
 * drilldown (the SAME selection drives the Activity panel picker).
 *
 * REST is the source of truth: the session page's `onAttemptActivity` router
 * invalidates `monitoring-overview` / `monitoring-participants` for the ping
 * kinds below ({@link isMonitoringDashboardActivity}), mirroring the
 * isAiAlertActivity pattern.
 *
 * Honesty: counts are observations only (no verdicts); absent/unreachable
 * data renders as explicit states, never fabricated.
 */

/** True when an ATTEMPT_ACTIVITY ping changes dashboard aggregates. */
export function isMonitoringDashboardActivity(ev: RealtimeEventEnvelope): boolean {
  const type = ev.activityType;
  if (type == null) return false;
  return (
    type.startsWith("AI_ALERT_") ||
    type.startsWith("EVIDENCE_") ||
    type.startsWith("RECORDING_") ||
    type.startsWith("CAMERA_") ||
    type === "MONITORING_GAP" ||
    type === "ALERT_REVIEW_RECORDED"
  );
}

/** English review-status labels for the dashboard (VN lives on the cards). */
export const REVIEW_STATUS_LABEL_EN: Record<AlertReviewStatus, string> = {
  UNREVIEWED: "Unreviewed",
  VIEWED: "Viewed",
  FALSE_POSITIVE: "False positive",
  NEEDS_FOLLOW_UP: "Needs follow-up",
  NOTED: "Noted",
  REVIEWED_NO_CONCLUSION: "No conclusion",
};

function reviewStatusVariant(
  status: AlertReviewStatus
): "default" | "accent" | "warn" | "destructive" {
  if (status === "UNREVIEWED") return "warn";
  if (status === "NEEDS_FOLLOW_UP") return "destructive";
  if (status === "VIEWED") return "accent";
  return "default";
}

const CAMERA_STATE_LABEL: Record<ParticipantCameraState, string> = {
  CONNECTED: "Connected",
  RECONNECTING: "Reconnecting",
  IDLE: "Idle",
  REVOKED: "Revoked",
  NONE: "No camera",
};

function cameraStateVariant(
  state: ParticipantCameraState
): "default" | "success" | "warn" | "destructive" {
  if (state === "CONNECTED") return "success";
  if (state === "RECONNECTING") return "warn";
  if (state === "REVOKED") return "destructive";
  return "default";
}

function attemptStatusVariant(status: string): "default" | "accent" | "success" {
  if (status === "IN_PROGRESS") return "accent";
  if (status === "SUBMITTED") return "success";
  return "default";
}

export function MonitoringDashboard({
  sessionId,
  selectedAttemptId,
  onSelectAttempt,
}: {
  sessionId: number;
  /** Same selection that drives the Activity panel picker (page-owned). */
  selectedAttemptId: number | null;
  onSelectAttempt: (attemptId: number | null) => void;
}) {
  const overviewQuery = useQuery({
    queryKey: ["exam-sessions", sessionId, "monitoring-overview"],
    queryFn: () => getMonitoringOverview(sessionId),
    enabled: Number.isFinite(sessionId) && sessionId > 0,
  });

  return (
    <div
      data-testid="monitoring-dashboard"
      className={cn(cardVariants(), "mt-6 p-6")}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Monitoring dashboard
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            Unified observations for this session — counts only, never a verdict.
          </p>
        </div>
        {overviewQuery.data && (
          <span
            role="status"
            aria-live="polite"
            className="font-mono text-xs text-[#94A3B8]"
          >
            as of {formatTime(overviewQuery.data.asOf)}
          </span>
        )}
      </div>

      {overviewQuery.isPending ? (
        <p
          role="status"
          className="animate-pulse py-6 text-center text-sm text-[#64748B]"
        >
          Loading overview…
        </p>
      ) : overviewQuery.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-3 text-sm font-medium text-[#EF4444]"
        >
          Couldn&apos;t load the monitoring overview.{" "}
          <button
            type="button"
            onClick={() => void overviewQuery.refetch()}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : (
        <OverviewSection overview={overviewQuery.data} />
      )}

      <ParticipantsTable
        sessionId={sessionId}
        selectedAttemptId={selectedAttemptId}
        onSelectAttempt={onSelectAttempt}
      />
    </div>
  );
}

/** KPI row (MetricCard pattern) + the full breakdown of §3.1 fields. */
function OverviewSection({ overview }: { overview: MonitoringOverviewResponse }) {
  return (
    <section aria-label="Monitoring overview">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="In progress"
          value={overview.attempts.inProgress}
          tone="accent"
        />
        <KpiCard label="Submitted" value={overview.attempts.submitted} />
        <KpiCard label="Cameras connected" value={overview.camera.connected} />
        <KpiCard
          label="Unreviewed alerts"
          value={overview.ai.unreviewedAlerts}
          tone={overview.ai.unreviewedAlerts > 0 ? "warn" : undefined}
        />
        <KpiCard label="Evidence ready" value={overview.evidence.available} />
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-5">
        <OverviewGroup title="Attempts" rows={[["Total", overview.attempts.total], ["In progress", overview.attempts.inProgress], ["Submitted", overview.attempts.submitted], ["Graded", overview.attempts.graded]]} />
        <OverviewGroup title="Camera" rows={[["Connected", overview.camera.connected], ["Publishing", overview.camera.publishing], ["Reconnecting", overview.camera.reconnecting], ["Idle", overview.camera.idle], ["Revoked", overview.camera.revoked]]} />
        <OverviewGroup title="AI alerts" rows={[["Enabled", overview.ai.enabled ? "Yes" : "No"], ["Open", overview.ai.openAlerts], ["Closed", overview.ai.closedAlerts], ["Unreviewed", overview.ai.unreviewedAlerts], ["Last detection", formatDateTime(overview.ai.lastDetectionAt)]]} />
        <OverviewGroup title="Recording" rows={[["Mode", overview.recording.fullRecordingEnabled ? "Full" : overview.recording.rollingBufferActive ? "Rolling buffer" : "Off"], ["Active jobs", overview.recording.activeJobs], ["Complete jobs", overview.recording.completeJobs], ["Failed jobs", overview.recording.failedJobs]]} />
        <OverviewGroup title="Evidence" rows={[["Available", overview.evidence.available], ["Partial", overview.evidence.partial], ["Pending", overview.evidence.pending], ["Failed", overview.evidence.failed], ["Expired", overview.evidence.expired]]} />
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "accent" | "warn";
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 text-center shadow-sm">
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "text-2xl font-extrabold tabular-nums",
          tone === "accent"
            ? "text-[#0052FF]"
            : tone === "warn"
              ? "text-[#F59E0B]"
              : "text-[#0F172A]"
        )}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-xs uppercase tracking-wide text-[#64748B]">
        {label}
      </p>
    </div>
  );
}

function OverviewGroup({
  title,
  rows,
}: {
  title: string;
  rows: [string, string | number][];
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
        {title}
      </p>
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[#64748B]">{label}</dt>
            <dd className="font-semibold tabular-nums text-[#0F172A]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const STATUS_FILTER_OPTIONS: ParticipantsQueryFilters["status"][] = [
  "ALL",
  "IN_PROGRESS",
  "SUBMITTED",
  "GRADED",
];

const CAMERA_FILTER_OPTIONS: ParticipantsQueryFilters["cameraState"][] = [
  "ALL",
  "CONNECTED",
  "RECONNECTING",
  "IDLE",
  "REVOKED",
  "NONE",
];

const REVIEW_FILTER_OPTIONS: ParticipantsQueryFilters["reviewStatus"][] = [
  "ALL",
  "UNREVIEWED",
  "VIEWED",
  "FALSE_POSITIVE",
  "NEEDS_FOLLOW_UP",
  "NOTED",
  "REVIEWED_NO_CONCLUSION",
];

function ParticipantsTable({
  sessionId,
  selectedAttemptId,
  onSelectAttempt,
}: {
  sessionId: number;
  selectedAttemptId: number | null;
  onSelectAttempt: (attemptId: number | null) => void;
}) {
  const [filters, setFilters] = useState<ParticipantsQueryFilters>(
    DEFAULT_PARTICIPANTS_FILTERS
  );

  const query = useInfiniteQuery({
    queryKey: ["exam-sessions", sessionId, "monitoring-participants", filters],
    queryFn: ({ pageParam }) =>
      getMonitoringParticipants(sessionId, filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Number.isFinite(sessionId) && sessionId > 0,
    placeholderData: keepPreviousData,
  });

  const items: MonitoringParticipantItem[] = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );
  const norm = query.error as NormalizedApiError | null | undefined;
  const offline = norm?.kind === "network";
  const filtersActive =
    filters.status !== "ALL" ||
    filters.cameraState !== "ALL" ||
    filters.reviewStatus !== "ALL";


  return (
    <section aria-label="Participants" className="mt-6">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
        Participants
      </p>

      {/* Filters drive the query key — a change refetches from page 1. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor={`participants-status-${sessionId}`}
            className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
          >
            Attempt status
          </label>
          <select
            id={`participants-status-${sessionId}`}
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as ParticipantsQueryFilters["status"],
              }))
            }
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 pr-9 text-sm font-medium text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
          >
            {STATUS_FILTER_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All statuses" : value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`participants-camera-${sessionId}`}
            className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
          >
            Camera
          </label>
          <select
            id={`participants-camera-${sessionId}`}
            value={filters.cameraState}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                cameraState: e.target
                  .value as ParticipantsQueryFilters["cameraState"],
              }))
            }
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 pr-9 text-sm font-medium text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
          >
            {CAMERA_FILTER_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All cameras" : CAMERA_STATE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`participants-review-${sessionId}`}
            className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
          >
            Review status
          </label>
          <select
            id={`participants-review-${sessionId}`}
            value={filters.reviewStatus}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                reviewStatus: e.target
                  .value as ParticipantsQueryFilters["reviewStatus"],
              }))
            }
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 pr-9 text-sm font-medium text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
          >
            {REVIEW_FILTER_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "ALL"
                  ? "All review states"
                  : REVIEW_STATUS_LABEL_EN[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {query.isPending ? (
        <p
          role="status"
          className="animate-pulse py-6 text-center text-sm text-[#64748B]"
        >
          Loading participants…
        </p>
      ) : query.isError ? (
        <p
          role="alert"
          className={cn(
            "rounded-lg border px-4 py-3 text-sm font-medium",
            offline
              ? "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#F59E0B]"
              : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
          )}
        >
          {offline
            ? "Connection lost — participant data may be stale. "
            : "Couldn't load participants. "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
          <p>
            {filtersActive
              ? "No participants match the current filters."
              : "No participant attempts yet."}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_PARTICIPANTS_FILTERS)}
              className="mt-2 rounded-lg text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:text-[#0052FF]/80 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
                  <th scope="col" className="px-3 py-2">Participant</th>
                  <th scope="col" className="px-3 py-2">Attempt</th>
                  <th scope="col" className="px-3 py-2">Camera</th>
                  <th scope="col" className="px-3 py-2">AI alerts</th>
                  <th scope="col" className="px-3 py-2">Recording</th>
                  <th scope="col" className="px-3 py-2">Evidence</th>
                  <th scope="col" className="px-3 py-2">Review</th>
                  <th scope="col" className="px-3 py-2">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ParticipantRow
                    key={item.attemptId}
                    item={item}
                    selected={item.attemptId === selectedAttemptId}
                    onSelect={onSelectAttempt}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {query.hasNextPage && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ParticipantRow({
  item,
  selected,
  onSelect,
}: {
  item: MonitoringParticipantItem;
  selected: boolean;
  onSelect: (attemptId: number | null) => void;
}) {
  return (
    <tr
      data-testid="monitoring-participant-row"
      data-attempt-id={item.attemptId}
      onClick={() => onSelect(item.attemptId)}
      aria-label={`Select ${item.displayName} (attempt ${item.attemptNumber})`}
      className={cn(
        "cursor-pointer border-b border-[#E2E8F0] transition-colors hover:bg-[#F1F5F9]/60 focus-within:bg-[#F1F5F9]/60",
        selected && "bg-[#0052FF]/5 hover:bg-[#0052FF]/5"
      )}
    >
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => onSelect(item.attemptId)}
          className={cn(
            "text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
            selected ? "text-[#0052FF]" : "text-[#0F172A]"
          )}
        >
          {item.displayName}
          <span className="ml-1.5 font-mono text-xs font-normal text-[#64748B]">
            #{item.attemptNumber}
          </span>
        </button>
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={attemptStatusVariant(item.attemptStatus)}>
          {item.attemptStatus}
        </Badge>
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={cameraStateVariant(item.camera.state)}>
          {CAMERA_STATE_LABEL[item.camera.state]}
        </Badge>
        {item.camera.online && !item.camera.publishing && (
          <span
            className="ml-1.5 text-[11px] font-semibold text-[#F59E0B]"
            title="Transport connected but no verified published track"
          >
            no track
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-[#0F172A]">
        {!item.ai.enabled ? (
          <span className="text-[#64748B]">Disabled</span>
        ) : (
          <>
            {item.ai.unreviewedAlerts > 0 ? (
              <Badge variant="warn">{item.ai.unreviewedAlerts} unreviewed</Badge>
            ) : (
              <span className="text-[#64748B]">0 unreviewed</span>
            )}
            <span className="ml-1.5 text-[#94A3B8]">
              {item.ai.openAlerts} open / {item.ai.totalAlerts} total
            </span>
            <span
              className="ml-1.5 text-[#94A3B8]"
              title="Raw accepted detections (grouped into alerts) and quarantined late/duplicate events"
            >
              {item.ai.detections} det{item.ai.quarantined > 0 ? ` · ${item.ai.quarantined} quarantined` : ""}
            </span>
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-[#0F172A]">
        {item.recording.mode === "NONE" ? (
          <span className="text-[#64748B]">Off</span>
        ) : (
          <>
            <span className="font-semibold">{item.recording.mode}</span>
            <span className="ml-1.5 text-[#94A3B8]">
              {item.recording.completeJobs}/{item.recording.completeJobs + item.recording.activeJobs} jobs
            </span>
            {item.recording.failedJobs > 0 && (
              <Badge variant="destructive" className="ml-1.5">
                {item.recording.failedJobs} failed
              </Badge>
            )}
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-[#0F172A]">
        {item.evidence.snapshots} snapshots · {item.evidence.clips} clips
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={reviewStatusVariant(item.reviewStatus)}>
          {REVIEW_STATUS_LABEL_EN[item.reviewStatus] ?? item.reviewStatus}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-[#94A3B8]">
        {formatDateTime(item.lastActivityAt)}
      </td>
    </tr>
  );
}
