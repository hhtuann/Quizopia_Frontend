"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSessionAiAlerts,
  type AiAlertItem,
} from "@/lib/api/ai-detections";
import { fetchSessionEvidence, type EvidenceItem } from "@/lib/api/evidence";
import { parseGazeLabel, type GazeLabelInfo } from "@/lib/ai/gaze-core";
import { useEvidenceUrl } from "./EvidenceSection";
import { cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";
import { AlertReviewForm, REVIEW_STATUS_LABEL } from "@/components/teacher/monitoring/AlertReviewForm";
import type { AlertReviewStatus } from "@/lib/api/alert-review";

/**
 * P4-C teacher AI alert feed (CONTRACT §5/§6). Sits in the LiveMonitor
 * layout. REST backfill `GET /api/exam-sessions/{id}/ai-alerts` on mount;
 * LiveMonitor invalidates this query on AI_ALERT_* activity pings and on WS
 * reconnect (REST is the source of truth). Cursor merge: newer pages are
 * merged by alertId, newest first.
 *
 * Honesty (CONTRACT §8): cards show observations with confidence + provenance
 * and the disclaimer "AI observations only — they do not automatically establish misconduct."
 * The bbox mini-render draws the normalized boxes from latestDetections.
 * When the session stores evidence snapshots (P4-D) and one is AVAILABLE
 * for the alert, that snapshot is shown underneath the boxes; otherwise
 * the frame stays a neutral dark canvas. The snapshot is the frame the
 * alert's FIRST detection was computed on (captured client-side at that
 * moment), and over a photo the boxes drawn are that same detection's
 * (`firstDetections`), so they line up; the caption says which frame.
 *
 * P4-E: each card gains teacher review controls (action + note + history,
 * `AlertReviewForm`) and provenance chips — "AI-detected" (detector
 * fields) vs "Instructor review" (review fields) vs "Unreviewed"
 * (UNREVIEWED). Reviews are assessments, never verdicts.
 */

/** True when an ATTEMPT_ACTIVITY ping concerns the AI alert feed. */
export function isAiAlertActivity(ev: RealtimeEventEnvelope): boolean {
  const type = ev.activityType;
  return type != null && type.startsWith("AI_ALERT_");
}

/** Union by alertId, sorted newest (highest id) first. Pure — unit-tested. */
export function mergeAlertItems(
  prev: AiAlertItem[],
  next: AiAlertItem[]
): AiAlertItem[] {
  const byId = new Map<number, AiAlertItem>();
  for (const item of prev) byId.set(item.alertId, item);
  for (const item of next) byId.set(item.alertId, item); // next wins (fresher)
  return [...byId.values()].sort((a, b) => b.alertId - a.alertId);
}

const ALERT_LABEL: Record<AiAlertItem["alertType"], string> = {
  PHONE_DETECTED: "Phone detected",
  SCREEN_DETECTED: "Secondary screen detected",
  MULTIPLE_PERSONS_DETECTED: "Multiple people detected",
  PERSON_NOT_VISIBLE: "Student not visible",
  LOOKING_AWAY: "Looking away from the screen",
};

const GAZE_DIRECTION_LABEL: Record<GazeLabelInfo["direction"], string> = {
  left: "to the left",
  right: "to the right",
  up: "upward",
  down: "downward",
  frequent: "repeatedly",
};

const signedDeg = (v: number): string => `${v > 0 ? "+" : ""}${v}°`;

/** Newest AVAILABLE snapshot per alertId. Pure — unit-tested. */
export function snapshotsByAlert(items: EvidenceItem[]): Map<number, EvidenceItem> {
  const stamp = (e: EvidenceItem): number =>
    new Date(e.capturedAt ?? e.createdAt).getTime() || 0;
  const byAlert = new Map<number, EvidenceItem>();
  for (const item of items) {
    if (item.kind !== "SNAPSHOT" || item.status !== "AVAILABLE") continue;
    const current = byAlert.get(item.alertId);
    if (current == null || stamp(item) > stamp(current)) byAlert.set(item.alertId, item);
  }
  return byAlert;
}

/** Human-readable summary of a gaze payload label; null for non-gaze boxes. Pure. */
export function describeGazeLabel(label: string | null | undefined): string | null {
  const info = parseGazeLabel(label);
  if (!info) return null;
  return `Looking ${GAZE_DIRECTION_LABEL[info.direction]} · horizontal deviation ${signedDeg(
    info.deltaYaw
  )}, vertical deviation ${signedDeg(info.deltaPitch)} from baseline`;
}

const BOX_CLASS_LABEL: Record<number, string> = {
  0: "person",
  62: "tv",
  63: "laptop",
  67: "cell phone",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AiAlertFeed({ sessionId }: { sessionId: number }) {
  const PAGE_SIZE = 20;
  const queryClient = useQueryClient();
  // Older pages append on user action; the live page-1 query refetches on
  // AI_ALERT_* pings — the render-time merge below unions them (cursor
  // merge, newest first) without cascading effect setState.
  const [olderItems, setOlderItems] = useState<AiAlertItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["exam-sessions", sessionId, "ai-alerts"],
    queryFn: () => getSessionAiAlerts(sessionId, { limit: PAGE_SIZE }),
    enabled: Number.isFinite(sessionId) && sessionId > 0,
  });

  const items = useMemo(
    () => mergeAlertItems(olderItems, data?.items ?? []),
    [olderItems, data]
  );

  // P4-D snapshots for the cards. Key sits under the ["…","evidence"]
  // prefix LiveMonitor invalidates on EVIDENCE_* pings. A failure (or a
  // session without snapshots) just leaves the dark canvas.
  const { data: evidence } = useQuery({
    queryKey: ["exam-sessions", sessionId, "evidence", "feed-snapshots"],
    queryFn: () =>
      fetchSessionEvidence(sessionId, { kind: "SNAPSHOT", limit: FEED_SNAPSHOT_PAGE }),
    enabled: Number.isFinite(sessionId) && sessionId > 0,
  });
  const snapshots = useMemo(() => snapshotsByAlert(evidence ?? []), [evidence]);
  // The list endpoint caps at 100 (newest first). When it came back full,
  // older alerts may still have a snapshot — those cards look it up by id.
  const snapshotListFull = (evidence?.length ?? 0) >= FEED_SNAPSHOT_PAGE;

  const loadOlder = async (): Promise<void> => {
    const cursor = items.length > 0 ? items[items.length - 1].alertId : undefined;
    if (cursor == null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await getSessionAiAlerts(sessionId, { cursor, limit: PAGE_SIZE });
      setOlderItems((prev) => mergeAlertItems(prev, older.items));
      setHasMore(older.nextCursor != null);
    } catch {
      // Older-page backfill failure is non-fatal; the button stays.
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className={cn(cardVariants(), "mt-6 p-6")} data-testid="ai-alert-feed">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold tracking-tight text-[#0F172A]">
          AI Alerts
        </h3>
        <button
          type="button"
          onClick={() =>
            void Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["exam-sessions", sessionId, "ai-alerts"],
              }),
              queryClient.invalidateQueries({
                queryKey: ["exam-sessions", sessionId, "evidence"],
              }),
            ])
          }
          className="rounded-lg px-2 py-1 text-xs font-semibold text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
        >
          Refresh
        </button>
      </div>
      <p className="mb-4 text-xs font-medium text-[#94A3B8]">
        AI observations only — they do not automatically establish misconduct.
      </p>

      {isPending && <p className="text-sm text-[#64748B]">Loading alerts…</p>}
      {isError && (
        <p className="text-sm text-[#64748B]">
          Could not load alerts — this section does not affect the exam session.
        </p>
      )}
      {!isPending && !isError && items.length === 0 && (
        <p className="text-sm text-[#64748B]">No AI alerts yet.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((alert) => (
            <li key={alert.alertId}>
              <AiAlertCard
                alert={alert}
                sessionId={sessionId}
                snapshot={snapshots.get(alert.alertId)}
                lookUpSnapshot={snapshotListFull && !snapshots.has(alert.alertId)}
              />
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && hasMore && (
        <button
          type="button"
          onClick={() => void loadOlder()}
          disabled={loadingOlder}
          className="mt-3 text-xs font-semibold text-[#0052FF] outline-none transition-colors hover:text-[#0052FF]/80 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
        >
          {loadingOlder ? "Loading…" : "Load older alerts"}
        </button>
      )}
    </div>
  );
}

/**
 * A snapshot counts as "the detection frame" only when it was captured at
 * the alert's first detection (the client holds that exact frame; if it
 * could not, it uploads a later live frame stamped with its own time).
 */
export const SNAPSHOT_FRAME_TOLERANCE_MS = 1_500;

/** Snapshot page the feed loads in one call (= backend MAX_PAGE). */
export const FEED_SNAPSHOT_PAGE = 100;

export function snapshotIsDetectionFrame(
  snapshot: Pick<EvidenceItem, "capturedAt">,
  firstDetectedAt: string
): boolean {
  if (!snapshot.capturedAt) return false;
  const a = new Date(snapshot.capturedAt).getTime();
  const b = new Date(firstDetectedAt).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= SNAPSHOT_FRAME_TOLERANCE_MS;
}

export function AiAlertCard({
  alert,
  sessionId,
  snapshot: listedSnapshot,
  lookUpSnapshot = false,
}: {
  alert: AiAlertItem;
  sessionId: number;
  /** P4-D snapshot for this alert, shown under the boxes when present. */
  snapshot?: EvidenceItem;
  /** The feed's snapshot page was full and had none for this alert: ask
   *  the server for this alert's snapshot directly. */
  lookUpSnapshot?: boolean;
}) {
  const confidence =
    alert.maxConfidence != null ? `${Math.round(alert.maxConfidence * 100)}%` : "—";
  const first = formatTime(alert.firstDetectedAt);
  const last = formatTime(alert.lastDetectedAt);
  const window =
    first === last ? first : `${first} → ${last}`;
  const provenance =
    alert.provenance === "WORKER_VERIFIED"
      ? "WORKER"
      : alert.provenance === "CLIENT_MODEL"
        ? "CLIENT MODEL"
        : "—";
  const latestDetections = alert.latestDetections ?? [];
  const { data: ownSnapshots } = useQuery({
    queryKey: ["exam-sessions", sessionId, "evidence", "alert-snapshot", alert.alertId],
    queryFn: () =>
      fetchSessionEvidence(sessionId, { kind: "SNAPSHOT", alertId: alert.alertId, limit: 10 }),
    enabled: lookUpSnapshot && listedSnapshot == null,
  });
  const snapshot =
    listedSnapshot ?? (ownSnapshots ? snapshotsByAlert(ownSnapshots).get(alert.alertId) : undefined);
  // Presigned URL only for cards that have a snapshot; the photo (and every
  // caption about it) appears only once the URL actually resolved.
  const { data: snapshotUrl } = useEvidenceUrl(
    sessionId,
    snapshot?.evidenceId ?? "",
    snapshot != null
  );
  const hasSnapshot = snapshot != null && Boolean(snapshotUrl?.url);
  const isDetectionFrame =
    hasSnapshot && snapshotIsDetectionFrame(snapshot, alert.firstDetectedAt);
  // The snapshot is the frame the alert's FIRST detection ran on, so over
  // a photo the boxes of THAT detection are drawn (same frame → they line
  // up). Without a photo, or on a backend that does not send them, the
  // latest boxes are shown as before.
  const firstDetections = alert.firstDetections ?? null;
  const boxesMatchPhoto =
    isDetectionFrame && (firstDetections != null || alert.detectionCount <= 1);
  const detections =
    isDetectionFrame && firstDetections != null ? firstDetections : latestDetections;
  const isGaze = alert.alertType === "LOOKING_AWAY";
  const gazeSummary = isGaze
    ? latestDetections.map((d) => describeGazeLabel(d.label)).find((s) => s != null) ?? null
    : null;
  // Match the frame to the snapshot's real shape so the boxes keep their
  // proportions over it; 4:3 when there is no image.
  const aspectRatio =
    hasSnapshot && snapshot.width && snapshot.height
      ? `${snapshot.width} / ${snapshot.height}`
      : "4 / 3";
  const boxCaption = !hasSnapshot
    ? "Detection boxes from the analyzed frame — no evidence image is available for this alert"
    : !isDetectionFrame
      ? `Evidence image submitted by the student's device at ${formatTime(snapshot.capturedAt ?? snapshot.createdAt)} — not the frame used for detection; boxes show the latest detection`
      : boxesMatchPhoto
      ? alert.detectionCount <= 1
        ? "Evidence image submitted by the student's device — the same frame used for detection"
        : "Evidence image submitted by the student's device — frame and boxes from the first detection"
      : "Evidence image submitted by the student's device — frame from the first detection; boxes show the latest detection";
  // P4-E review rollup — absent field (pre-P4-E backend) reads UNREVIEWED.
  const reviewStatus: AlertReviewStatus = alert.reviewStatus ?? "UNREVIEWED";
  const reviewStatusChip =
    reviewStatus === "UNREVIEWED" ? (
      <span className="whitespace-nowrap rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-2 py-0.5 text-[11px] font-semibold text-[#F59E0B]">
        {REVIEW_STATUS_LABEL[reviewStatus]}
      </span>
    ) : (
      <span className="whitespace-nowrap rounded-full border border-[#10B981]/30 bg-[#10B981]/5 px-2 py-0.5 text-[11px] font-semibold text-[#10B981]">
        {`Instructor review · ${REVIEW_STATUS_LABEL[reviewStatus]}`}
        {alert.reviewedAt ? ` · ${formatTime(alert.reviewedAt)}` : ""}
      </span>
    );

  return (
    <div
      data-testid="ai-alert-card"
      data-attempt-id={alert.attemptId}
      className="rounded-xl border border-[#E2E8F0] bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#0F172A]">
            {alert.studentName ?? `#${alert.studentUserId}`}
          </span>
          <span className="whitespace-nowrap rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-2 py-0.5 text-[11px] font-semibold text-[#F59E0B]">
            {ALERT_LABEL[alert.alertType]}
          </span>
          <span className="whitespace-nowrap rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-[#64748B]">
            {provenance}
          </span>
          {/* P4-E provenance distinction: detector fields vs review fields.
           * UNREVIEWED is stated honestly — an unverified observation. */}
          <span className="whitespace-nowrap rounded-full border border-[#0052FF]/30 bg-[#0052FF]/5 px-2 py-0.5 text-[11px] font-semibold text-[#0052FF]">
            AI-detected
          </span>
          {reviewStatusChip}
        </div>
        <span className="font-mono text-[11px] text-[#94A3B8]">{last}</span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <div>
          <dt className="text-[#94A3B8]">
            {isGaze ? "Face confidence" : "Confidence"}
          </dt>
          <dd className="font-semibold text-[#0F172A]">{confidence}</dd>
        </div>
        <div>
          <dt className="text-[#94A3B8]">Detection count</dt>
          <dd className="font-semibold text-[#0F172A]">{alert.detectionCount}</dd>
        </div>
        <div>
          <dt className="text-[#94A3B8]">Time range</dt>
          <dd className="font-semibold text-[#0F172A]">{window}</dd>
        </div>
        <div>
          <dt className="text-[#94A3B8]">Model</dt>
          <dd className="font-mono font-semibold text-[#0F172A]">
            {alert.modelId && alert.modelVersion
              ? `${alert.modelId}@${alert.modelVersion}`
              : "—"}
          </dd>
        </div>
      </dl>

      {isGaze && (
        <p className="mt-2 text-[11px] font-medium text-[#64748B]" data-testid="ai-alert-gaze">
          {gazeSummary ? `${gazeSummary}. ` : ""}
          Gaze direction is a model estimate — for instructor reference only.
        </p>
      )}

      {(detections.length > 0 || hasSnapshot) && (
        <div className="mt-3">
          <div
            className={cn(
              "relative w-full overflow-hidden rounded-lg border border-[#334155] bg-[#0F172A]",
              hasSnapshot ? "max-w-[360px]" : "max-w-[240px]"
            )}
            style={{ aspectRatio }}
            data-testid="ai-alert-bboxes"
            aria-label={boxCaption}
          >
            {hasSnapshot && (
              // eslint-disable-next-line @next/next/no-img-element -- presigned URL (300s TTL) must not pass through the Next image optimizer
              <img
                src={snapshotUrl!.url}
                alt="Evidence image submitted by the student's device"
                data-testid="ai-alert-snapshot"
                className="absolute inset-0 h-full w-full object-fill"
              />
            )}
            {detections.map((d, i) => {
              const [x1, y1, x2, y2] = d.bbox;
              return (
                <div
                  key={i}
                  className="absolute border border-[#F59E0B] bg-[#F59E0B]/10"
                  style={{
                    left: `${x1 * 100}%`,
                    top: `${y1 * 100}%`,
                    width: `${Math.max(0, (x2 - x1)) * 100}%`,
                    height: `${Math.max(0, (y2 - y1)) * 100}%`,
                  }}
                >
                  <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-[#F59E0B] px-1 text-[8px] font-bold leading-tight text-[#0F172A]">
                    {parseGazeLabel(d.label) ? "face" : BOX_CLASS_LABEL[d.classId] ?? d.label}{" "}
                    {Math.round(d.confidence * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">{boxCaption}</p>
        </div>
      )}

      {/* P4-E: teacher review (actions + note + history) — assessment over
       * the observation, never a verdict. */}
      <AlertReviewForm alert={alert} sessionId={sessionId} />
    </div>
  );
}
