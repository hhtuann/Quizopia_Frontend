/**
 * P4-C AI proctoring API (CONTRACT §3.1 + §5). Mirrors backend
 * `monitoring/api/…AiDetectionController` / `AiAlertController`; see
 * p4c/CONTRACT.md. All calls ride the shared authenticated axios instance.
 *
 * Student ingest is CLIENT observation telemetry (ADR-008 D8): failures are
 * degraded-status only and never block answering.
 */
import { http } from "@/lib/api/http-client";

export type AiDetectionEventType =
  | "PHONE_OBSERVED"
  | "SCREEN_OBSERVED"
  | "MULTIPLE_PERSONS_OBSERVED"
  | "PERSON_NOT_OBSERVED";

export type AiDetectionRuntime = "ORT_WEB_WASM" | "ORT_WEB_WEBGPU" | "WORKER_ORT";

/** One detection box, normalized 0..1 to frameWidth/frameHeight. */
export interface AiDetectionPayloadBox {
  classId: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface AiDetectionItem {
  /** UUID — idempotency identity (duplicates return DUPLICATE, never re-alert). */
  eventId: string;
  eventType: AiDetectionEventType;
  /** Frame capture time (client clock, ISO instant, stored verbatim). */
  observedAt: string;
  /** Monotonic per attempt+client. */
  sequence: number;
  modelId: string;
  modelVersion: string;
  runtime: AiDetectionRuntime;
  frameWidth: number;
  frameHeight: number;
  processingMs: number;
  /** Only the detections that drove the event (≤8). */
  detections: AiDetectionPayloadBox[];
}

export type AiDetectionIngestStatus =
  | "ACCEPTED"
  | "DUPLICATE"
  | "QUARANTINED_LATE"
  | "REJECTED";

export interface AiDetectionIngestResult {
  eventId: string;
  status: AiDetectionIngestStatus;
  reason?: string;
}

/** Batch ingest (≤8 items). One invalid item rejects the whole batch (400). */
export function ingestAiDetections(
  attemptId: number,
  items: AiDetectionItem[]
): Promise<{ results: AiDetectionIngestResult[] }> {
  return http.post(`/api/attempts/${attemptId}/ai-detections`, { items });
}

/* ------------------------------------------------------------------ */
/* Teacher alert feed (CONTRACT §5).                                   */
/* ------------------------------------------------------------------ */

export type AiAlertType =
  | "PHONE_DETECTED"
  | "SCREEN_DETECTED"
  | "MULTIPLE_PERSONS_DETECTED"
  | "PERSON_NOT_VISIBLE";

export type AiAlertProvenance = "CLIENT_MODEL" | "WORKER_VERIFIED";

export interface AiAlertItem {
  alertId: number;
  attemptId: number;
  studentUserId: number;
  studentName: string | null;
  alertType: AiAlertType;
  status: "OPEN";
  firstDetectedAt: string;
  lastDetectedAt: string;
  detectionCount: number;
  maxConfidence: number | null;
  modelId: string | null;
  modelVersion: string | null;
  provenance: AiAlertProvenance | null;
  latestDetections: AiDetectionPayloadBox[] | null;
}

export interface AiAlertListParams {
  /** alertId cursor — return alerts with a SMALLER id (newest first paging). */
  cursor?: number;
  limit?: number;
  status?: "OPEN";
}

export interface AiAlertListResponse {
  items: AiAlertItem[];
  nextCursor: number | null;
}

/** Teacher alert backfill — REST is the source of truth on (re)connect. */
export function getSessionAiAlerts(
  sessionId: number,
  params: AiAlertListParams = {}
): Promise<AiAlertListResponse> {
  const search = new URLSearchParams();
  if (params.cursor != null) search.set("cursor", String(params.cursor));
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.status != null) search.set("status", params.status);
  const qs = search.toString();
  return http.get(`/api/exam-sessions/${sessionId}/ai-alerts${qs ? `?${qs}` : ""}`);
}
