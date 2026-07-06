/**
 * FE2 — API client barrel.
 *
 * Import from `@/lib/api`:
 *   import { http, setAccessTokenGetter, isApiError, normalizeAxiosError } from "@/lib/api";
 *   import type { ApiError, NormalizedApiError } from "@/lib/api";
 */

// Runtime values
export { http, setAccessTokenGetter, httpClient } from "./http-client";
export {
  isApiError,
  normalizeAxiosError,
  ERROR_CODES,
} from "./errors";

// Types
export type { ApiError, NormalizedApiError, KnownErrorCode } from "./errors";
