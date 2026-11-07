import { http } from "./http-client";
import { extractAxiosError, type NormalizedApiError } from "./errors";

/**
 * Community fork API (P3, issue #48 — ADR-006 §7/§8 frozen contract,
 * backend #47).
 *
 * `POST /api/community/publications/{id}/fork` — TEACHER + `COMMUNITY_FORK` +
 * `EXAM_CREATE` only (§7 auth matrix: guest 401, STUDENT 403, so the FE never
 * calls this unless the caller holds the TEACHER role). Requires the
 * `Idempotency-Key` header (8–128 printable ASCII, §3 HMAC-hashed server-side):
 * the FE generates ONE crypto UUID per user action and keeps it across
 * retries of that action (network retry reuses the key; a fresh dialog open
 * or a different publication is a NEW action with a NEW key — §10).
 *
 * Responses:
 * - 201 first creation — `{targetExamId, sourcePublicationId, sourceTitle,
 *   authorAlias, forkedAt}` (the ONLY fields; attribution comes from the
 *   already-public snapshot). No answer/option/question material or source
 *   exam ids ever ship (§12).
 * - 200 idempotent retry success — same shape, same target (§8 step 2/9).
 * - 409 `COMMUNITY_IDEMPOTENCY_CONFLICT` — key reused on a DIFFERENT
 *   publication: the user must start a new fork action (new key).
 * - 403 `COMMUNITY_FORK_NOT_ALLOWED` — `reuse_policy` flipped to NO_FORK (or
 *   a hidden race lost under the §8 lock): server state moved, refresh.
 * - 429 — §9 fixed window; `Retry-After` may carry the wait.
 * - 404 — source fails the §4 visibility predicate (hidden/unpublished/
 *   archived/inactive publisher): anti-enumeration, no reason string.
 *
 * Failures reject as `NormalizedApiError` via the axios layer; this module
 * reduces them to {@link ForkErrorKind} via {@link classifyForkError}.
 */

/** §7 fork success body (201 first creation AND 200 idempotent retry). */
export interface ForkDraftResponse {
  /** The caller's new DRAFT exam — open it at `/exams/{targetExamId}`. */
  targetExamId: number;
  /** The publication that was forked (echoes the path id). */
  sourcePublicationId: number;
  /** Attribution credit — snapshot of the source title at fork time. */
  sourceTitle: string;
  /** Attribution credit — the author's public alias (never PII). */
  authorAlias: string;
  /** `community_fork_records.created_at`, ISO-8601. */
  forkedAt: string;
}

/** `Idempotency-Key` shape (§7): 8–128 printable ASCII characters. */
const IDEMPOTENCY_KEY_PATTERN = /^[\x20-\x7e]{8,128}$/;

/** True when `key` satisfies the §7 `Idempotency-Key` header contract. */
export function isValidIdempotencyKey(key: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(key);
}

/**
 * `POST /api/community/publications/{id}/fork` — clone the published
 * composition snapshot into the caller's independent DRAFT exam + question
 * bank. `idempotencyKey` MUST satisfy {@link isValidIdempotencyKey} (the FE
 * always passes a generated crypto UUID — a violation is a programming error,
 * so this fails fast instead of leaking a 400 round-trip).
 */
export function forkPublication(
  publicationId: number,
  idempotencyKey: string
): Promise<ForkDraftResponse> {
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new TypeError(
      "Idempotency-Key must be 8–128 printable ASCII characters"
    );
  }
  return http.post<ForkDraftResponse>(
    `/api/community/publications/${publicationId}/fork`,
    undefined,
    { headers: { "Idempotency-Key": idempotencyKey } }
  );
}

/** Failure classes the fork UX distinguishes (see module doc). */
export type ForkErrorKind =
  /** 409 `COMMUNITY_IDEMPOTENCY_CONFLICT` — start a NEW fork action. */
  | "idempotencyConflict"
  /** 403 `COMMUNITY_FORK_NOT_ALLOWED` — policy changed / hidden race. */
  | "forkNotAllowed"
  /** 404 — source no longer passes the §4 predicate. */
  | "gone"
  /** 401 — session expired at AuthN after the single-flight refresh retry. */
  | "unauthenticated"
  /** 429 — §9 rate window (see `retryAfterSeconds`). */
  | "rateLimited"
  /** Request sent, no response — safe to retry with the SAME key. */
  | "network"
  /** Anything else. */
  | "other";

/** {@link classifyForkError} result. */
export interface ForkErrorClassification {
  kind: ForkErrorKind;
  /**
   * `Retry-After` on 429, in whole seconds (numeric form, or an HTTP-date
   * resolved against `Date.now()`). `null` when absent/unparseable or the
   * failure is not a 429.
   */
  retryAfterSeconds: number | null;
}

/**
 * Parse a `Retry-After` value: delta-seconds (`"30"`) or HTTP-date
 * (`"Sun, 08 Nov 2026 12:00:00 GMT"`). Returns null for anything else.
 */
export function parseRetryAfterSeconds(header: unknown): number | null {
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const asDate = new Date(trimmed);
  if (!Number.isNaN(asDate.getTime())) {
    return Math.max(0, Math.ceil((asDate.getTime() - Date.now()) / 1000));
  }
  return null;
}

/** Reduce any thrown value to a {@link ForkErrorClassification}. Never throws. */
export function classifyForkError(err: unknown): ForkErrorClassification {
  const none = { kind: "other" as const, retryAfterSeconds: null };
  const norm = err as NormalizedApiError | undefined;
  if (!norm) return none;
  if (norm.kind === "network") return { kind: "network", retryAfterSeconds: null };
  if (norm.kind !== "api") return none;
  switch (norm.status) {
    case 409:
      if (norm.code === "COMMUNITY_IDEMPOTENCY_CONFLICT") {
        return { kind: "idempotencyConflict", retryAfterSeconds: null };
      }
      return none;
    case 403:
      if (norm.code === "COMMUNITY_FORK_NOT_ALLOWED") {
        return { kind: "forkNotAllowed", retryAfterSeconds: null };
      }
      return none;
    case 404:
      return { kind: "gone", retryAfterSeconds: null };
    case 401:
      return { kind: "unauthenticated", retryAfterSeconds: null };
    case 429: {
      // The header lives on the raw AxiosError (the NormalizedApiError
      // surface deliberately carries only the ApiError body). Axios
      // normalizes header names to lower-case; both spellings are probed.
      const axiosErr = extractAxiosError(norm);
      const headers = axiosErr?.response?.headers as
        | Record<string, unknown>
        | undefined;
      const retryAfterSeconds = parseRetryAfterSeconds(
        headers?.["retry-after"] ?? headers?.["Retry-After"]
      );
      return { kind: "rateLimited", retryAfterSeconds };
    }
    default:
      return none;
  }
}
