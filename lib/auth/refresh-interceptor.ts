import { type AxiosInstance } from "axios";
import { extractAxiosError, type NormalizedApiError } from "@/lib/api/errors";
import { isPublicPasswordRequest } from "@/lib/api/http-client";
import { authApi } from "./api";
import type { AuthStore } from "./store";

const AUTH_PATHS: Record<string, true> = {
  "/api/auth/refresh": true, "/api/auth/login": true, "/api/auth/register": true,
  "/api/auth/logout": true, "/api/auth/oauth/exchange": true,
};

/** Each installed client owns one generation-scoped flight. */
export function installRefreshInterceptor(httpClient: AxiosInstance, store: AuthStore): number {
  let inflight: { generation: number; promise: Promise<boolean> } | null = null;
  return httpClient.interceptors.response.use(
    (response) => response,
    async (normalized: NormalizedApiError) => {
      const config = extractAxiosError(normalized)?.config;
      const path = (config?.url ?? "").split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+/, "");
      if (!config || normalized.kind !== "api" || normalized.code !== "AUTH_ACCESS_TOKEN_INVALID"
        || AUTH_PATHS[path] || isPublicPasswordRequest(path) || config._retried) throw normalized;
      const generation = config._sessionGeneration;
      const current = () => generation === store.getState().generation;
      // An untagged request cannot safely acquire authority in the current session.
      if (generation === undefined || !current()) throw normalized;
      if (!inflight || inflight.generation !== generation) {
        const flight = {
          generation,
          promise: (async () => {
            try {
              const token = await authApi.refresh();
              if (!current()) return false;
              store.getState().setAccessToken(token.accessToken);
              return true;
            } catch {
              if (current()) store.getState().invalidateSession();
              return false;
            }
          })(),
        };
        inflight = flight;
        void flight.promise.finally(() => {
          if (inflight === flight) inflight = null;
        });
      }
      const ok = await inflight.promise;
      if (!ok || !current()) throw normalized;
      return httpClient.request({ ...config, _retried: true });
    },
  );
}
