import type { AxiosInstance } from "axios";
import { httpClient, setAccessTokenGetter } from "@/lib/api";
import { authApi } from "./api";
import { useAuthStore } from "./store";
import { installRefreshInterceptor } from "./refresh-interceptor";

/**
 * Wire the auth layer to the shared axios client. Call at app boot — FE4 will
 * invoke `initAuth(httpClient)` from a client-side provider.
 *
 * - Registers the access-token getter so FE2's request interceptor attaches
 *   `Authorization: Bearer <accessToken>` from the in-memory store.
 * - Installs the single-flight refresh interceptor on the axios instance.
 *
 * Idempotent: safe under React StrictMode double-invoke (or any accidental
 * double boot). The access-token getter is re-registered on every call
 * (overwrite, harmless), but the refresh interceptor is installed exactly once
 * via the module-level `installed` guard — so a 401 never hits two refresh
 * interceptors (which would otherwise double-refresh on the failure path).
 */
let installed = false;

export function initAuth(client: AxiosInstance = httpClient): void {
  // Always (re)register the getter — overwrite is idempotent and cheap, so the
  // guard below never skips it even when it skips the interceptor.
  setAccessTokenGetter(() => useAuthStore.getState().accessToken);
  if (installed) return;
  installRefreshInterceptor(client, useAuthStore);
  installed = true;
}

/** Clear auth state from anywhere (non-React contexts). */
export const clearAuth = (): void => {
  useAuthStore.getState().clearAuth();
};

export { authApi, useAuthStore };
export type { AuthStore, AuthState } from "./store";
export type {
  AccountType,
  CurrentUserResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  TokenResponse,
  UserStatus,
} from "./types";
