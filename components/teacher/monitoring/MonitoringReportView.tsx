"use client";

import { useState } from "react";
import { Badge, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { http } from "@/lib/api/http-client";
import type { EvidenceUrlResponse } from "@/lib/api/evidence";
import type { AlertReviewAction } from "@/lib/api/alert-review";
import type {
  AttemptMonitoringReport,
  MonitoringReportAi,
  MonitoringReportActivity,
  MonitoringReportCamera,
  MonitoringReportEvidenceItem,
  MonitoringReportRecording,
  MonitoringReportReviewItem,
  MonitoringReportPolicy,
} from "@/lib/api/monitoring-report";
import { formatDateTime, formatTime } from "@/lib/utils/format";

/**
 * P4-E monitoring report renderer (design §3.6/§4) — shared by the session
 * detail card and the printable route (one renderer, never a fork).
 * Observations only: the disclaimer renders verbatim, AI counts are grouped
 * into three clearly separated stat groups (detections / alerts / reviews),
 * EXPIRED evidence rows are metadata-only (no play affordance), and nothing
 * implies a verdict.
 *
 * Sections carry `break-inside-avoid` so print pagination keeps groups whole
 * (see DESIGN.md → Print).
 */

/** English action labels for the report (VN lives on the review form). */
export const REPORT_ACTION_LABEL_EN: Record<AlertReviewAction, string> = {
  MARK_VIEWED: "Marked viewed",
  FALSE_POSITIVE: "False positive",
  NEEDS_FOLLOW_UP: "Needs follow-up",
  NOTED: "Noted",
  REVIEWED_NO_CONCLUSION: "Reviewed — no conclusion",
};

/** `0.97` → `"97%"`; absent → `"—"` (never a fabricated coverage number). */
export function formatCoverageRatio(
  ratio: number | null | undefined
): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/**
 * A report evidence row is playable only when the backend sent a playbackRef
 * AND the status can serve media — EXPIRED/FAILED/PENDING rows render
 * metadata only (honest absence).
 */
export function isReportEvidencePlayable(
  item: MonitoringReportEvidenceItem
): boolean {
  return (
    item.playbackRef != null &&
    (item.status === "AVAILABLE" || item.status === "PARTIAL")
  );
}

/** `byType` entries sorted by count (desc), ties by type name (asc). */
export function sortTypeCounts(
  byType: Array<{ type: string; count: number }>
): Array<[string, number]> {
  return [...byType]
    .map((e) => [e.type, e.count] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function StatGroup({
  title,
  stats,
}: {
  title: string;
  stats: Array<[string, string | number]>;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
        {title}
      </p>
      <dl className="space-y-1 text-sm">
        {stats.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-[#64748B]">{label}</dt>
            <dd className="font-semibold tabular-nums text-[#0F172A]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h3 className="mb-3 font-display text-base font-bold tracking-tight text-[#0F172A]">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function MonitoringReportView({
  report,
  className,
}: {
  report: AttemptMonitoringReport;
  className?: string;
}) {
  return (
    <div
      data-testid="monitoring-report-view"
      className={cn(cardVariants(), "p-6", className)}
    >
      {/* Identity + window */}
      <header className="break-inside-avoid">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          Monitoring report
        </h2>
        <p className="mt-1 text-sm font-semibold text-[#0F172A]">
          {report.attempt.studentName}
          <span className="ml-1.5 font-mono text-xs font-normal text-[#64748B]">
            attempt #{report.attempt.attemptNumber} · #{report.attempt.attemptId}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="default">{report.attempt.attemptStatus}</Badge>
          <span className="text-xs text-[#64748B]">
            Started {formatDateTime(report.attempt.startedAt)}
          </span>
          <span className="text-xs text-[#64748B]">
            Deadline {formatDateTime(report.attempt.deadlineAt)}
          </span>
          <span className="text-xs text-[#64748B]">
            Submitted {formatDateTime(report.attempt.submittedAt)}
          </span>
        </div>
        <p className="mt-2 text-xs font-medium text-[#64748B]">
          Monitored window {formatDateTime(report.monitoringWindow.from)} →{" "}
          {formatDateTime(report.monitoringWindow.to)} (
          {report.monitoringWindow.minutes} min)
        </p>
        <p className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-4 py-3 text-xs font-semibold text-[#F59E0B]">
          {report.disclaimer}
        </p>
      </header>

      <ReportPolicySection policy={report.policy} />
      <ReportActivitySection activity={report.activity} />
      <ReportCameraSection camera={report.camera} />
      <ReportRecordingSection recording={report.recording} />
      <ReportAiSection ai={report.ai} />
      <ReportEvidenceSection evidence={report.evidence} />
      <ReportReviewsSection reviews={report.reviews} />
      <ReportRetentionSection retention={report.retention} />
    </div>
  );
}

function ReportPolicySection({
  policy,
}: {
  policy: MonitoringReportPolicy;
}) {
  return (
    <ReportSection title="Monitoring policy">
      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <StatGroup
          title="Signals"
          stats={[
            ["Monitoring", policy.monitoringEnabled ? "Enabled" : "Disabled"],
            ["AI detection", policy.aiDetectionEnabled ? "On" : "Off"],
            ["Activity tracking", policy.activityTrackingEnabled ? "On" : "Off"],
          ]}
        />
        <StatGroup
          title="Media"
          stats={[
            ["Snapshots", policy.snapshotsEnabled ? "On" : "Off"],
            ["Clips", policy.clipsEnabled ? "On" : "Off"],
            ["Full recording", policy.fullRecordingEnabled ? "On" : "Off"],
          ]}
        />
        <StatGroup
          title="Retention"
          stats={[
            ["Media", `${policy.mediaRetentionDays} days`],
            ["Activity", `${policy.activityRetentionDays} days`],
          ]}
        />
      </div>
    </ReportSection>
  );
}

function ReportActivitySection({
  activity,
}: {
  activity: MonitoringReportActivity;
}) {
  return (
    <ReportSection title="Activity">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatGroup
          title="Totals"
          stats={[
            ["Events", activity.totalEvents],
            ["Answers accepted", activity.answerAccepted],
            ["Distinct questions", activity.distinctQuestionsAnswered],
          ]}
        />
        <StatGroup
          title="Browser"
          stats={[
            ["Tab hidden", activity.browser.tabHidden],
            ["Tab visible", activity.browser.tabVisible],
            ["Focus lost", activity.browser.focusLost],
            ["Focus gained", activity.browser.focusGained],
            ["Page reloads", activity.browser.pageReload],
            ["Connection lost", activity.browser.connectionLost],
          ]}
        />
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:col-span-2">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
            Events by type
          </p>
          {sortTypeCounts(activity.byType).length === 0 ? (
            <p className="text-xs text-[#64748B]">No activity recorded.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {sortTypeCounts(activity.byType).map(([type, count]) => (
                <li
                  key={type}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="font-mono text-[#64748B]">{type}</span>
                  <span className="font-semibold tabular-nums text-[#0F172A]">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ReportSection>
  );
}

function ReportCameraSection({
  camera,
}: {
  camera: MonitoringReportCamera;
}) {
  return (
    <ReportSection title="Camera">
      {camera.neverConnected ? (
        <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-3 text-xs font-medium text-[#64748B]">
          Camera was never connected during this attempt — no camera coverage
          exists to report.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <StatGroup
            title="Coverage"
            stats={[
              ["Connected periods", camera.connectedPeriods.length],
              ["Disconnect periods", camera.disconnectPeriods.length],
              ["Monitoring gaps", camera.monitoringGaps],
              ["Last event", camera.lastEvent ?? "—"],
            ]}
          />
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
              Connected periods
            </p>
            {camera.connectedPeriods.length === 0 ? (
              <p className="text-xs text-[#64748B]">None recorded.</p>
            ) : (
              <ul className="space-y-1 tabular-nums">
                {camera.connectedPeriods.map((period, i) => (
                  <li key={i} className="text-xs text-[#0F172A]">
                    {formatTime(period.from)} → {formatTime(period.to)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
              Disconnect periods
            </p>
            {camera.disconnectPeriods.length === 0 ? (
              <p className="text-xs text-[#64748B]">None recorded.</p>
            ) : (
              <ul className="space-y-1 tabular-nums">
                {camera.disconnectPeriods.map((period, i) => (
                  <li key={i} className="text-xs text-[#0F172A]">
                    {formatTime(period.from)} → {formatTime(period.to)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ReportSection>
  );
}

function ReportRecordingSection({
  recording,
}: {
  recording: MonitoringReportRecording;
}) {
  return (
    <ReportSection title="Recording">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatGroup
          title="Coverage"
          stats={[
            ["Mode", recording.mode],
            ["Segments", recording.segments.length],
            ["Gaps > 2s", recording.gaps.length],
            ["Coverage", formatCoverageRatio(recording.coverageRatio)],
          ]}
        />
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:col-span-2">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
            Segments
          </p>
          {recording.segments.length === 0 ? (
            <p className="text-xs text-[#64748B]">No recording segments.</p>
          ) : (
            <ul className="space-y-1.5">
              {recording.segments.map((segment) => (
                <li
                  key={segment.jobId}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <Badge
                    variant={
                      segment.status === "COMPLETE"
                        ? "success"
                        : segment.status === "FAILED"
                          ? "destructive"
                          : "default"
                    }
                  >
                    {segment.status}
                  </Badge>
                  <span className="font-mono text-[#64748B]">
                    {segment.jobId.slice(0, 8)}
                  </span>
                  <span className="tabular-nums text-[#0F172A]">
                    {segment.startedAt != null ? formatTime(segment.startedAt) : "—"} →{" "}
                    {segment.endedAt != null ? formatTime(segment.endedAt) : "—"}
                  </span>
                  <span className="text-[#94A3B8]">
                    {formatDurationMs(segment.durationMs)} · {formatBytes(segment.bytes)}
                  </span>
                  {segment.objectDeleted && (
                    <Badge variant="warn">object deleted</Badge>
                  )}
                  {segment.expiresAt != null && (
                    <span className="text-[#94A3B8]">
                      expires {formatDateTime(segment.expiresAt)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {recording.gaps.length > 0 && (
            <>
              <p className="mb-1 mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
                Gaps
              </p>
              <ul className="space-y-1 tabular-nums">
                {recording.gaps.map((gap, i) => (
                  <li key={i} className="text-xs text-[#0F172A]">
                    {formatTime(gap.from)} → {formatTime(gap.to)} ({gap.seconds}s)
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </ReportSection>
  );
}

function ReportAiSection({ ai }: { ai: MonitoringReportAi }) {
  return (
    <ReportSection title="AI observations">
      {/* Three clearly separated stat groups: detections / alerts / reviews. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatGroup
          title="Detections"
          stats={[
            ["Raw detections", ai.rawDetections],
            ["Quarantined", ai.quarantined],
          ]}
        />
        <StatGroup
          title="Alerts"
          stats={[
            ["Grouped alerts", ai.groupedAlerts],
            ["Open", ai.openAlerts],
            ["Closed", ai.closedAlerts],
          ]}
        />
        <StatGroup
          title="Reviews"
          stats={[
            ["Reviewed alerts", ai.reviewedAlerts],
            ["Unreviewed alerts", ai.unreviewedAlerts],
            ["False positives", ai.falsePositives],
          ]}
        />
      </div>
      {ai.models.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {ai.models.map((model) => (
            <li
              key={`${model.modelId}@${model.modelVersion}`}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="font-mono font-semibold text-[#0F172A]">
                {model.modelId}@{model.modelVersion}
              </span>
              <Badge variant="default">{model.provenance}</Badge>
              <span className="font-mono text-[#94A3B8]">{model.runtime}</span>
              <span className="tabular-nums text-[#64748B]">
                {model.detections} detections
              </span>
            </li>
          ))}
        </ul>
      )}
      {ai.limitsNote != null && (
        <p className="mt-2 text-xs font-medium text-[#94A3B8]">{ai.limitsNote}</p>
      )}
    </ReportSection>
  );
}

function ReportEvidenceSection({
  evidence,
}: {
  evidence: MonitoringReportEvidenceItem[];
}) {
  const [openErrors, setOpenErrors] = useState<Record<string, string>>({});

  const openEvidence = async (item: MonitoringReportEvidenceItem) => {
    // playbackRef IS the presign endpoint (300s TTL) — fetch, then open.
    if (item.playbackRef == null) return;
    try {
      const presigned = await http.get<EvidenceUrlResponse>(
        item.playbackRef
      );
      window.open(presigned.url, "_blank", "noopener");
    } catch {
      setOpenErrors((prev) => ({
        ...prev,
        [item.evidenceId]: "Couldn't open — the link may have expired.",
      }));
    }
  };

  return (
    <ReportSection title="Evidence">
      {evidence.length === 0 ? (
        <p className="text-xs text-[#64748B]">No evidence recorded.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="report-evidence-list">
          {evidence.map((item) => {
            const playable = isReportEvidencePlayable(item);
            return (
              <li
                key={item.evidenceId}
                data-testid="report-evidence-row"
                data-status={item.status}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <Badge
                  variant={
                    item.status === "AVAILABLE"
                      ? "success"
                      : item.status === "PARTIAL"
                        ? "warn"
                        : item.status === "FAILED"
                          ? "destructive"
                          : "default"
                  }
                >
                  {item.status}
                </Badge>
                <Badge variant="default">{item.kind}</Badge>
                <span className="text-[#64748B]">{item.provenance}</span>
                <span className="tabular-nums text-[#94A3B8]">
                  captured {formatDateTime(item.capturedAt)}
                </span>
                {item.bytes != null && (
                  <span className="text-[#94A3B8]">{formatBytes(item.bytes)}</span>
                )}
                {item.alertId != null && (
                  <span className="font-mono text-[#94A3B8]">
                    alert #{item.alertId}
                  </span>
                )}
                {item.expiresAt != null && (
                  <span className="text-[#94A3B8]">
                    expires {formatDateTime(item.expiresAt)}
                  </span>
                )}
                {playable ? (
                  <button
                    type="button"
                    onClick={() => void openEvidence(item)}
                    className="rounded-lg font-semibold text-[#0052FF] outline-none transition-colors hover:text-[#0052FF]/80 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                  >
                    Open
                  </button>
                ) : (
                  <span className="text-[#94A3B8]">
                    {item.status === "EXPIRED"
                      ? "expired — metadata only"
                      : item.status === "PENDING"
                        ? "processing"
                        : "not playable"}
                  </span>
                )}
                {openErrors[item.evidenceId] && (
                  <span className="font-medium text-[#EF4444]">
                    {openErrors[item.evidenceId]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ReportSection>
  );
}

function ReportReviewsSection({
  reviews,
}: {
  reviews: MonitoringReportReviewItem[];
}) {
  return (
    <ReportSection title="Teacher reviews">
      {reviews.length === 0 ? (
        <p className="text-xs text-[#64748B]">No reviews recorded.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="report-reviews-list">
          {reviews.map((review) => (
            <li
              key={review.reviewId}
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold text-[#64748B]">
                  v{review.version}
                </span>
                <span className="font-semibold text-[#0F172A]">
                  {REPORT_ACTION_LABEL_EN[review.action] ?? review.action}
                </span>
                <span className="text-[#64748B]">
                  alert #{review.alertId} · {review.reviewerName ?? "—"}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-[#94A3B8]">
                  {formatDateTime(review.reviewedAt)}
                </span>
              </div>
              {review.note && (
                <p className="mt-1 whitespace-pre-wrap text-[#64748B]">
                  {review.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}

function ReportRetentionSection({
  retention,
}: {
  retention: AttemptMonitoringReport["retention"];
}) {
  return (
    <ReportSection title="Retention">
      <p className="text-xs text-[#64748B]">
        Media retained {retention.mediaRetentionDays} days · activity retained{" "}
        {retention.activityRetentionDays} days · as of{" "}
        {formatDateTime(retention.asOf)}
      </p>
    </ReportSection>
  );
}
