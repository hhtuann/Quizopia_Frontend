/**
 * P4-E alert review API (design §3.3/§3.4). Mirrors backend
 * `MonitoringAlertReviewController`: append-only reviews with optimistic
 * versioning + idempotency keys. NEVER mutates detection/alert fields —
 * reviews are teacher assessments layered over AI observations, not verdicts.
 */
import { http } from "@/lib/api/http-client";
import type { NormalizedApiError } from "@/lib/api/errors";

/** The five review actions (backend CHECK constraint, V42). */
export type AlertReviewAction =
  | "MARK_VIEWED"
  | "FALSE_POSITIVE"
  | "NEEDS_FOLLOW_UP"
  | "NOTED"
  | "REVIEWED_NO_CONCLUSION";

/** Denormalized alert review status (`monitoring_ai_alerts.review_status`). */
export type AlertReviewStatus =
  | "UNREVIEWED"
  | "VIEWED"
  | "FALSE_POSITIVE"
  | "NEEDS_FOLLOW_UP"
  | "NOTED"
  | "REVIEWED_NO_CONCLUSION";

/** 409 code when `expectedVersion` != the alert's current reviewVersion. */
export const REVIEW_VERSION_CONFLICT_CODE = "MONITORING_REVIEW_VERSION_CONFLICT";

/** POST body — `expectedVersion` is the optimistic token (alert.reviewVersion). */
export interface AlertReviewRequest {
  expectedVersion: number;
  action: AlertReviewAction;
  /** Optional, <= 1000 chars. */
  note?: string;
}

/** Backend record `AlertReviewResponse` (§3.3). */
export interface AlertReviewResponse {
  alertId: number;
  reviewVersion: number;
  reviewStatus: AlertReviewStatus;
  action: AlertReviewAction;
  note: string | null;
  reviewerUserId: number;
  reviewedAt: string;
  /** True when the Idempotency-Key replayed a stored outcome. */
  idempotentReplay: boolean;
}

/** Conflict message (it includes the current version), or null when `err`
 * is not the review 409 — narrows once so callers never inline-cast. */
export function reviewConflictMessage(err: unknown): string | null {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind !== "api" || norm.code !== REVIEW_VERSION_CONFLICT_CODE) {
    return null;
  }
  return norm.message;
}

/** Backend record `AlertReviewHistoryResponse.CurrentReview` (§3.4) —
 * null-shaped (`status: "UNREVIEWED", version: 0`) when no review exists. */
export interface AlertReviewCurrent {
  status: AlertReviewStatus;
  version: number;
  reviewedAt: string | null;
  reviewerName: string | null;
}

/** Backend record `AlertReviewHistoryResponse.Item` (§3.4). */
export interface AlertReviewHistoryItem {
  version: number;
  action: AlertReviewAction;
  note: string | null;
  reviewerName: string | null;
  reviewedAt: string;
}

/** Backend record `AlertReviewHistoryResponse` (§3.4). */
export interface AlertReviewHistoryResponse {
  alertId: number;
  currentReview: AlertReviewCurrent;
  history: AlertReviewHistoryItem[];
}

/**
 * Fresh idempotency key per submit intent — regenerated after every success
 * and after an acknowledged version conflict (never reused for a new intent).
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for runtimes without crypto.randomUUID (never a security
  // boundary — the key only dedupes accidental double submits).
  return `rev-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** True when a normalized error is the review version 409 (§3.3). */
export function isReviewVersionConflict(err: unknown): boolean {
  const norm = err as NormalizedApiError | undefined;
  return norm?.kind === "api" && norm.code === REVIEW_VERSION_CONFLICT_CODE;
}

/** `POST /api/monitoring/alerts/{alertId}/reviews` — same key replays the
 * stored outcome (`idempotentReplay: true`), even after later reviews. */
export function submitAlertReview(
  alertId: number,
  request: AlertReviewRequest,
  idempotencyKey: string
): Promise<AlertReviewResponse> {
  return http.post(`/api/monitoring/alerts/${alertId}/reviews`, request, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** `GET /api/monitoring/alerts/{alertId}/reviews` — current + full history. */
export function getAlertReviews(
  alertId: number
): Promise<AlertReviewHistoryResponse> {
  return http.get(`/api/monitoring/alerts/${alertId}/reviews`);
}
