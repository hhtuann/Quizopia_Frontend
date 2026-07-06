/**
 * FE2 — HTTP client (axios) + interceptors.
 *
 * `baseURL` comes from `NEXT_PUBLIC_API_URL`. Endpoints use the FULL path
 * (e.g. "/api/auth/login", "/api/attempts/801") — do NOT bake "/api" into the
 * baseURL; this matches the backend contract prefix (auth Day 4 / question
 * Day 5 / exam Day 6 / attempt Day 7 all use "/api", never "/api/v1").
 *
 * `withCredentials: true` → refresh token travels as an HttpOnly cookie (FE3).
 *
 * Auth seam for FE3: a request interceptor attaches
 * `Authorization: Bearer <accessToken>` via {@link setAccessTokenGetter}.
 * FE2 does NOT implement token storage, refresh, queueing, or 401 single-flight
 * — that is FE3's job (see TODO[FE3] below).
 *
 * Pure TS module — no `'use client'`, no `window`/`document` at module
 * top-level (safe for SSR + client). `process.env.NEXT_PUBLIC_*` is inlined by
 * Next at build time for both runtimes.
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { normalizeAxiosError } from "./errors";

const RAW_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

if (process.env.NODE_ENV !== "production" && RAW_BASE_URL === "") {
  // Warn once per module load (dev only). Do NOT throw — this module is
  // imported during SSR/build, and throwing at module top-level breaks the
  // build.
  // TECH DEBT (browser reachability): the Docker value `http://backend:8080`
  // does NOT resolve from a browser. In dev use `http://localhost:8080`; in
  // prod use a Next rewrite/proxy. Tracked in fe2-implementation-report.md.
  console.warn(
    "[http-client] NEXT_PUBLIC_API_URL is empty — API calls will use relative paths and likely fail. Set a browser-reachable NEXT_PUBLIC_API_URL."
  );
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: RAW_BASE_URL,
  withCredentials: true,
  timeout: 15_000,
});

/* ------------------------------------------------------------------ */
/* Auth seam — FE3 owns the real token store + refresh.                */
/* ------------------------------------------------------------------ */

let accessTokenGetter: () => string | null = () => null;

/**
 * Register the access-token provider. FE3 calls this once after wiring its
 * token store so outgoing requests carry `Authorization: Bearer <accessToken>`.
 */
export function setAccessTokenGetter(fn: () => string | null): void {
  accessTokenGetter = fn;
}

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = accessTokenGetter();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ------------------------------------------------------------------ */
/* Response error normalization.                                       */
/* ------------------------------------------------------------------ */

// TODO[FE3]: add a response interceptor here for 401 single-flight refresh
// (call refresh-token endpoint → retry the original request once → reject on
// failure). FE2 intentionally does NOT implement refresh / queue / retry.
httpClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeAxiosError(error))
);

/* ------------------------------------------------------------------ */
/* Typed wrappers — unwrap response.data, reject NormalizedApiError.   */
/* ------------------------------------------------------------------ */

function unwrap<T>(p: Promise<AxiosResponse<T>>): Promise<T> {
  return p.then((res) => res.data);
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.get<T>(url, config)),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.post<T>(url, body, config)),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.put<T>(url, body, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.delete<T>(url, config)),
};
