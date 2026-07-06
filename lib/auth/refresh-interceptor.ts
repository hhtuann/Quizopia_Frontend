import { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { extractAxiosError, type NormalizedApiError } from "@/lib/api/errors";
import { authApi } from "./api";
import type { AuthStore } from "./store";

/** Axios request config carrying our internal retry marker. */
type RetryableConfig = AxiosRequestConfig & { _retried?: boolean };

/**
 * Auth endpoints that must NEVER trigger refresh or be retried on 401:
 *  - `/api/auth/refresh` → blocks refresh-for-refresh (no loop).
 *  - `/api/auth/login` / `/api/auth/register` → bad credentials are real failures.
 *  - `/api/auth/logout` → best-effort; never block on a missing token.
 */
const AUTH_PATHS = new Set<string>([
  "/api/auth/refresh",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
]);

/**
 * The shared refresh promise.
 * - `null`  → idle (no refresh running).
 * - non-null → a refresh is in flight; concurrent 401s await THIS same promise
 *   instead of starting a second refresh (single-flight).
 *
 * `boolean`: `true` = refresh succeeded (token rotated), `false` = refresh failed.
 */
let inflight: Promise<boolean> | null = null;

/** `true` only for a retriable expired-access-token 401. */
function shouldRefresh(normalized: NormalizedApiError, config: RetryableConfig): boolean {
  // 1. Must be the backend "access token invalid/missing" error.
  if (normalized.kind !== "api" || normalized.code !== "AUTH_ACCESS_TOKEN_INVALID") {
    return false;
  }
  // 2. Never refresh for auth endpoints (prevents refresh-for-refresh / login-401 loops).
  if (AUTH_PATHS.has(config.url ?? "")) {
    return false;
  }
  // 3. Never retry the same request twice (the `_retried` guard).
  if (config._retried) {
    return false;
  }
  return true;
}

/**
 * Install the single-flight refresh interceptor on the given axios instance.
 *
 * Registered AFTER FE2's normalizer response interceptor, so its `onRejected`
 * receives a `NormalizedApiError`; the original `AxiosError` (with request
 * config) is recovered via `extractAxiosError` (the `raw` contract owned by
 * `lib/api/errors`). The FE2 file is NOT modified — this relies purely on the
 * existing `raw` field.
 *
 * @returns the axios interceptor id (for optional eject).
 */
export function installRefreshInterceptor(httpClient: AxiosInstance, store: AuthStore): number {
  return httpClient.interceptors.response.use(
    (response) => response,
    async (normalized: NormalizedApiError) => {
      const axiosErr = extractAxiosError(normalized);
      const config: RetryableConfig | undefined = axiosErr?.config as RetryableConfig | undefined;

      // Not a retriable 401 → pass the normalized error through untouched.
      if (!config || !shouldRefresh(normalized, config)) {
        throw normalized;
      }

      // Single-flight: start at most one refresh; every concurrent 401 awaits it.
      if (!inflight) {
        inflight = (async (): Promise<boolean> => {
          try {
            const token = await authApi.refresh();
            store.getState().setAccessToken(token.accessToken);
            return true;
          } catch {
            // Refresh failed (revoked / expired / reuse-detected / network) →
            // clear auth EXACTLY ONCE. Queued requests reject below.
            store.getState().clearAuth();
            return false;
          }
        })();
        // Reset the slot once settled so a *later* 401 can refresh again.
        void inflight.finally(() => {
          inflight = null;
        });
      }

      const ok = await inflight;

      if (!ok) {
        // Refresh failed → reject queued request with its original normalized error.
        throw normalized;
      }

      // Refresh OK → retry this request EXACTLY ONCE. The `_retried` marker
      // makes `shouldRefresh` return false if the retry is STILL 401, so it
      // rejects straight instead of refreshing again (no loop, no double retry).
      const retryConfig: RetryableConfig = { ...config, _retried: true };
      return httpClient.request(retryConfig);
    }
  );
}
