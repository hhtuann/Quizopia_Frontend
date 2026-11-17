/**
 * P4-E attempt monitoring report API (design §3.6). Mirrors backend
 * `AttemptMonitoringReportController`: read-time aggregation for one attempt
 * (any attempt/session status). Observations only — the payload never joins
 * grades and the UI must never present it as a verdict.
 */
import { http } from "@/lib/api/http-client";
import type { AlertReviewAction } from "@/lib/api/alert-review";
import type {
  EvidenceKind,
  EvidenceProvenance,
  EvidenceStatus,
} from "@/lib/api/evidence";

/**
 * Attempt identity + window (design §3.6 `"attempt": {…identity+window…}`).
 * Field set mirrors the participants item (§3.2) minus the live rollups.
 */
export interface MonitoringReportAttempt {
  attemptId: number;
  sessionId: number;
  sessionTitle: string;
  sessionCode: string;
  studentUserId: number;
  studentName: string;
  attemptNumber: number;
  attemptStatus: string;
  startedAt: string;
  submittedAt: string | null;
  deadlineAt: string | null;
}

/** Backend record `AttemptMonitoringReportResponse.Policy` (§3.6). */
export interface MonitoringReportPolicy {
  monitoringEnabled: boolean;
  aiDetectionEnabled: boolean;
  activityTrackingEnabled: boolean;
  snapshotsEnabled: boolean;
  fullRecordingEnabled: boolean;
  clipsEnabled: boolean;
  mediaRetentionDays: number;
  activityRetentionDays: number;
}

export interface MonitoringReportWindow {
  from: string;
  to: string;
  minutes: number;
}

export interface MonitoringReportActivity {
  totalEvents: number;
  answerAccepted: number;
  distinctQuestionsAnswered: number;
  browser: {
    tabHidden: number;
    tabVisible: number;
    focusLost: number;
    focusGained: number;
    pageReload: number;
    connectionLost: number;
  };
  /** eventType → count (every durable type, not just `browser`). */
  /** Every durable type with its count (backend CountByType array). */
  byType: Array<{ type: string; count: number }>;
}

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface MonitoringReportCamera {
  neverConnected: boolean;
  connectedPeriods: ReportPeriod[];
  disconnectPeriods: ReportPeriod[];
  monitoringGaps: number;
  lastEvent: string | null;
}

export interface MonitoringReportSegment {
  jobId: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  bytes: number | null;
  durationMs: number | null;
  objectDeleted: boolean;
  expiresAt: string | null;
  /** P4-D mint endpoint path — present only for playable states (F05). */
  playbackRef: string | null;
}

export interface MonitoringReportGap {
  from: string;
  to: string;
  seconds: number;
}

export interface MonitoringReportRecording {
  mode: "FULL" | "ROLLING" | "NONE";
  segments: MonitoringReportSegment[];
  gaps: MonitoringReportGap[];
  /** 0..1 share of the window covered by COMPLETE, non-deleted segments. */
  coverageRatio: number | null;
}

export interface MonitoringReportModel {
  modelId: string;
  modelVersion: string;
  provenance: string;
  runtime: string;
  detections: number;
}

export interface MonitoringReportAi {
  rawDetections: number;
  quarantined: number;
  groupedAlerts: number;
  openAlerts: number;
  closedAlerts: number;
  reviewedAlerts: number;
  unreviewedAlerts: number;
  falsePositives: number;
  models: MonitoringReportModel[];
  /** Honesty note rendered verbatim (never a verdict). */
  limitsNote: string | null;
}

export interface MonitoringReportEvidenceItem {
  evidenceId: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  provenance: EvidenceProvenance;
  capturedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  bytes: number | null;
  sha256: string | null;
  expiresAt: string | null;
  alertId: number | null;
  /** Presign endpoint path — omitted for unplayable states (EXPIRED/FAILED). */
  playbackRef: string | null;
}

export interface MonitoringReportReviewItem {
  reviewId: number;
  alertId: number;
  action: AlertReviewAction;
  note: string | null;
  reviewerName: string | null;
  reviewedAt: string;
  version: number;
}

/** Backend record `AttemptMonitoringReportResponse` (§3.6). */
export interface AttemptMonitoringReport {
  attempt: MonitoringReportAttempt;
  policy: MonitoringReportPolicy;
  monitoringWindow: MonitoringReportWindow;
  activity: MonitoringReportActivity;
  camera: MonitoringReportCamera;
  recording: MonitoringReportRecording;
  ai: MonitoringReportAi;
  evidence: MonitoringReportEvidenceItem[];
  reviews: MonitoringReportReviewItem[];
  retention: {
    mediaRetentionDays: number;
    activityRetentionDays: number;
    asOf: string;
  };
  disclaimer: string;
}

/**
 * `GET /api/attempts/{attemptId}/monitoring/report` (§3.6) — teacher-only
 * (session owner). Works for IN_PROGRESS/SUBMITTED/GRADED attempts.
 */
export function getAttemptMonitoringReport(
  attemptId: number
): Promise<AttemptMonitoringReport> {
  return http.get(`/api/attempts/${attemptId}/monitoring/report`);
}
