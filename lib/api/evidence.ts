/**
 * P4-D evidence & recording API (issues #91–#94). Mirrors backend
 * `evidence/api/…EvidenceControllers`; all calls ride the shared
 * authenticated axios instance.
 *
 * Honesty (ADR-009 D8): CLIENT_CAPTURE snapshots are frames the STUDENT's
 * machine submitted — they never imply verification. Clips are cut only
 * from footage that really covers the alert window (FAILED/NO_COVERAGE is
 * reported verbatim, never fabricated).
 */
import { http } from "@/lib/api/http-client";

export type EvidenceKind = "SNAPSHOT" | "CLIP";

export type EvidenceStatus =
  | "PENDING"
  | "AVAILABLE"
  | "PARTIAL"
  | "FAILED"
  | "EXPIRED";

export type EvidenceProvenance =
  | "CLIENT_CAPTURE"
  | "FULL_RECORDING"
  | "ROLLING_BUFFER";

export type RecordingKind = "FULL" | "ROLLING";

export type RecordingJobStatus =
  | "STARTING"
  | "ACTIVE"
  | "ENDING"
  | "COMPLETE"
  | "FAILED"
  | "ABORTED";

export interface EvidenceItem {
  /** UUID — also the path segment of the playback-url route. */
  evidenceId: string;
  attemptId: number;
  alertId: number;
  kind: EvidenceKind;
  status: EvidenceStatus;
  provenance: EvidenceProvenance;
  /** Nullable backend fields are omitted from the wire object. */
  contentType?: string;
  sha256?: string;
  bytes?: number;
  width?: number;
  height?: number;
  /** ISO instants. */
  capturedAt?: string;
  windowStart?: string;
  windowEnd?: string;
  /** Clip coverage JSON (windowStart/windowEnd/covered/gaps) — PARTIAL only. */
  coverage?: string;
  error?: string;
  createdAt: string;
  expiresAt: string;
}

export interface SnapshotResponse {
  evidenceId: string;
  status: EvidenceStatus;
  provenance: EvidenceProvenance;
  idempotentReplay: boolean;
}

export interface RecordingUrlResponse {
  url: string;
  /** ISO instant — when the presigned URL dies (300s TTL). */
  expiresAt: string;
}

export interface EvidenceUrlResponse {
  url: string;
  /** ISO instant — when the presigned URL dies (300s TTL). */
  expiresAt: string;
}

export interface RecordingSegment {
  jobId: string;
  attemptId: number;
  kind: RecordingKind;
  status: RecordingJobStatus;
  pulseIndex: number;
  startedAt?: string;
  endedAt?: string;
  bytes?: number;
  durationMs?: number;
  objectDeleted: boolean;
  error?: string;
  /**
   * Storage key of the segment's media object. The wire DTO currently
   * omits it (nullable-omitted); `bytes` presence is the fallback signal
   * that an object was actually written.
   */
  objectKey?: string;
}

export interface AttemptMediaStatus {
  fullRecordingEnabled: boolean;
  rollingBufferActive: boolean;
  snapshotsEnabled: boolean;
}

export interface EvidenceListParams {
  alertId?: number;
  kind?: EvidenceKind;
  limit?: number;
}

export interface SnapshotUploadRequest {
  alertId: number;
  /** Client capture time (epoch ms) — stored verbatim. */
  capturedAtMs: number;
  /** JPEG frame captured from the CURRENT feeder video. */
  blob: Blob;
  /** Fresh UUID per capture intent (duplicate-safe uploads). */
  idempotencyKey: string;
}

/** Student snapshot upload (multipart: file part + request params). */
export function uploadEvidenceSnapshot(
  attemptId: number,
  request: SnapshotUploadRequest
): Promise<SnapshotResponse> {
  const form = new FormData();
  form.append("file", request.blob, "snapshot.jpg");
  form.append("alertId", String(request.alertId));
  form.append("idempotencyKey", request.idempotencyKey);
  form.append("capturedAt", String(request.capturedAtMs));
  return http.post(`/api/attempts/${attemptId}/evidence/snapshots`, form);
}

/** Student view of what this attempt currently records/buffers. */
export function fetchAttemptMediaStatus(
  attemptId: number
): Promise<AttemptMediaStatus> {
  return http.get(`/api/attempts/${attemptId}/monitoring/media-status`);
}

/** Teacher evidence list (optionally scoped to one alert / kind). */
export function fetchSessionEvidence(
  sessionId: number,
  params: EvidenceListParams = {}
): Promise<EvidenceItem[]> {
  const search = new URLSearchParams();
  if (params.alertId != null) search.set("alertId", String(params.alertId));
  if (params.kind != null) search.set("kind", params.kind);
  if (params.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  return http.get(`/api/exam-sessions/${sessionId}/evidence${qs ? `?${qs}` : ""}`);
}

/** Teacher clip request — synchronous extraction; idempotent while usable. */
export function requestAlertClip(
  sessionId: number,
  alertId: number
): Promise<EvidenceItem> {
  return http.post(`/api/exam-sessions/${sessionId}/ai-alerts/${alertId}/clip`);
}

/** Presigned playback URL (300s TTL; 409 once EXPIRED/not usable). */
export function fetchEvidenceUrl(
  sessionId: number,
  evidenceId: string
): Promise<EvidenceUrlResponse> {
  return http.get(`/api/exam-sessions/${sessionId}/evidence/${evidenceId}/url`);
}

/** Recording job segments (FULL + ROLLING pulses) for the session. */
export function fetchSessionRecordings(
  sessionId: number
): Promise<RecordingSegment[]> {
  return http.get(`/api/exam-sessions/${sessionId}/recordings`);
}

/** Presigned recording playback URL (300s TTL; teacher-only, 409 when the
 * segment has no servable object). */
export function fetchRecordingUrl(
  sessionId: number,
  jobId: string
): Promise<RecordingUrlResponse> {
  return http.get(`/api/exam-sessions/${sessionId}/recordings/${jobId}/url`);
}
