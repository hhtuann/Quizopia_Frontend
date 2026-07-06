/**
 * FE2 — Error normalization layer.
 *
 * Mirrors the backend unified error body `ApiError`
 * (backend: com.hhtuann.backend.authentication.exception.ApiError — a Java
 * record serialized by ApiErrorWriter / GlobalExceptionHandler). Every
 * non-2xx failure is reduced to one {@link NormalizedApiError} so TanStack
 * Query / callers handle a single shape.
 *
 * Pure TS module — no `'use client'`, no `window`/`document` access at module
 * top-level (runs safely in SSR and browser).
 */

import { isAxiosError, type AxiosError } from "axios";

/**
 * Backend `ApiError` record, field-for-field. `path` and `traceId` are
 * nullable server-side (see ApiErrorWriter#build: request URI may be null,
 * MDC traceId is null when tracing inactive). `timestamp` is a Jackson
 * ISO-8601 string (Spring Boot writes dates as timestamps = false).
 */
export interface ApiError {
  /** ISO-8601 instant, e.g. "2026-07-03T07:31:00Z". */
  timestamp: string;
  /** HTTP status code. */
  status: number;
  /** Stable error code (an AuthErrorCode / domain code enum name). */
  code: string;
  /** Safe, non-sensitive human-readable message. */
  message: string;
  /** Request path; null when unavailable. */
  path: string | null;
  /** Distributed trace id; null when tracing is inactive. */
  traceId: string | null;
}

/**
 * One discriminated union every failure normalizes to.
 * - `api`: HTTP response whose body matches {@link ApiError}.
 * - `http`: HTTP response received but body is NOT ApiError (gateway/proxy/HTML).
 * - `network`: request sent, no response (timeout / DNS / CORS / offline).
 * - `unknown`: fallback for anything that is not an AxiosError.
 *
 * CONTRACT — `raw`: MUST hold the original `AxiosError` (never sanitized,
 * cloned, or renamed). It is consumed by `lib/auth/refresh-interceptor` via
 * {@link extractAxiosError} to recover the request config for single-flight
 * refresh + retry. `normalizeAxiosError` sets `raw = <the AxiosError>` in every
 * branch — do not change that without updating the refresh interceptor.
 */
export type NormalizedApiError =
  | {
      kind: "api";
      status: number;
      code: string;
      message: string;
      timestamp?: string;
      path?: string | null;
      traceId?: string | null;
      raw: unknown;
    }
  | { kind: "http"; status: number; message: string; raw: unknown }
  | { kind: "network"; message: string; raw: unknown }
  | { kind: "unknown"; message: string; raw: unknown };

/**
 * Type guard: true when `x` looks like a backend {@link ApiError} body
 * (object with numeric `status`, string `code`, string `message`).
 */
export function isApiError(x: unknown): x is ApiError {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.status === "number" &&
    typeof o.code === "string" &&
    typeof o.message === "string"
  );
}

/**
 * Normalize any thrown value (expected to be an AxiosError) into a single
 * {@link NormalizedApiError}. Never throws — always returns an object so
 * callers / TanStack Query error handlers can branch on `kind` uniformly.
 */
export function normalizeAxiosError(e: unknown): NormalizedApiError {
  if (!isAxiosError(e)) {
    return {
      kind: "unknown",
      message: e instanceof Error ? e.message : "Unknown error",
      raw: e,
    };
  }

  // Branch 1: an HTTP response was received.
  if (e.response) {
    const status = e.response.status;
    const data = e.response.data;

    // 1a: body matches the backend ApiError shape.
    if (isApiError(data)) {
      return {
        kind: "api",
        status: data.status,
        code: data.code,
        message: data.message,
        timestamp: data.timestamp,
        path: data.path,
        traceId: data.traceId,
        raw: e,
      };
    }

    // 1b: response present but body is NOT ApiError (proxy / gateway / HTML).
    return {
      kind: "http",
      status,
      message: e.message,
      raw: e,
    };
  }

  // Branch 2: request was sent but no response (timeout / DNS / CORS / offline).
  return {
    kind: "network",
    message: e.message,
    raw: e,
  };
}

/**
 * Recover the original `AxiosError` (with its `.config`) from a
 * {@link NormalizedApiError}. Returns `undefined` when `raw` is not an
 * AxiosError (e.g. an `unknown`-kind fallback). Co-located here because this
 * module owns the `raw` contract — see {@link NormalizedApiError}.
 *
 * Additive helper; does not alter `normalizeAxiosError` behavior.
 */
export function extractAxiosError(normalized: NormalizedApiError): AxiosError | undefined {
  return isAxiosError(normalized.raw) ? (normalized.raw as AxiosError) : undefined;
}

/**
 * Known stable error codes (auth subset). Domain codes (Question / Exam /
 * Attempt) are intentionally NOT enumerated — match on `code` as a plain
 * string instead, to avoid a maintenance trap. See backend AuthErrorCode and
 * day-7 attempt contract §13.
 */
export const ERROR_CODES = {
  AUTH_VALIDATION_ERROR: "AUTH_VALIDATION_ERROR",
  AUTH_ACCESS_TOKEN_INVALID: "AUTH_ACCESS_TOKEN_INVALID",
  AUTH_ACCESS_DENIED: "AUTH_ACCESS_DENIED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type KnownErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
