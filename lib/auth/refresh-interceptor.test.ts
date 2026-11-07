import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient, setAccessTokenGetter } from "@/lib/api/http-client";
import { authApi } from "./api";
import { installRefreshInterceptor } from "./refresh-interceptor";
import { beginSession, invalidateSession, useAuthStore } from "./store";
import type { TokenResponse } from "./types";
vi.mock("./api", () => ({ authApi: { refresh: vi.fn() } }));
const originalAdapter = httpClient.defaults.adapter;
let interceptor: number;
function expired(config: InternalAxiosRequestConfig): never {
  throw new AxiosError("expired", "ERR_BAD_REQUEST", config, undefined, {
    status: 401, statusText: "Unauthorized", headers: {}, config,
    data: { status: 401, code: "AUTH_ACCESS_TOKEN_INVALID", message: "expired" },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  beginSession();
  useAuthStore.getState().setAccessToken("old");
  setAccessTokenGetter(() => useAuthStore.getState().accessToken);
  interceptor = installRefreshInterceptor(httpClient, useAuthStore);
});
afterEach(() => { httpClient.interceptors.response.eject(interceptor); httpClient.defaults.adapter = originalAdapter; });
describe("generation-scoped refresh", () => {
  it("single-flights concurrent expired JWTs and retries each exactly once", async () => {
    const flight = Promise.withResolvers<TokenResponse>();
    vi.mocked(authApi.refresh).mockReturnValue(flight.promise);
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      if (!config._retried) return expired(config);
      return { status: 200, statusText: "OK", headers: {}, config, data: config.headers.Authorization };
    });
    httpClient.defaults.adapter = adapter;
    const a = httpClient.get("/protected/a");
    const b = httpClient.get("/protected/b");
    await vi.waitFor(() => expect(authApi.refresh).toHaveBeenCalledOnce());
    flight.resolve({ accessToken: "fresh" } as TokenResponse);
    expect((await Promise.all([a, b])).map((response) => response.data)).toEqual(["Bearer fresh", "Bearer fresh"]);
    expect(adapter).toHaveBeenCalledTimes(4);
  });
  it("never retries an expired JWT twice", async () => {
    vi.mocked(authApi.refresh).mockResolvedValue({ accessToken: "fresh" } as TokenResponse);
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => expired(config));
    httpClient.defaults.adapter = adapter;
    await expect(httpClient.get("/protected")).rejects.toMatchObject({ code: "AUTH_ACCESS_TOKEN_INVALID" });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(authApi.refresh).toHaveBeenCalledOnce();
  });
  it.each(["resolve", "reject"])("ignores old refresh %s and its finalizer while a new flight runs", async (outcome) => {
    const old = Promise.withResolvers<TokenResponse>();
    const fresh = Promise.withResolvers<TokenResponse>();
    vi.mocked(authApi.refresh).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    httpClient.defaults.adapter = async (config) => {
      if (!config._retried) return expired(config);
      return { status: 200, statusText: "OK", headers: {}, config, data: "ok" };
    };
    const a = httpClient.get("/old").catch((error: unknown) => error);
    await vi.waitFor(() => expect(authApi.refresh).toHaveBeenCalledTimes(1));
    beginSession();
    useAuthStore.getState().setAccessToken("new");
    const b = httpClient.get("/new");
    await vi.waitFor(() => expect(authApi.refresh).toHaveBeenCalledTimes(2));
    if (outcome === "resolve") old.resolve({ accessToken: "obsolete" } as TokenResponse);
    else old.reject(new Error("old failure"));
    await a;
    expect(useAuthStore.getState().accessToken).toBe("new");
    const c = httpClient.get("/also-new");
    // Flush the axios response interceptor chain without wall-clock sleeps.
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(authApi.refresh).toHaveBeenCalledTimes(2);
    fresh.resolve({ accessToken: "fresh" } as TokenResponse);
    await Promise.all([b, c]);
    expect(useAuthStore.getState().accessToken).toBe("fresh");
  });
  it("captures generation before dispatch and ignores a delayed old 401", async () => {
    const response = Promise.withResolvers<void>();
    httpClient.defaults.adapter = async (config) => { await response.promise; return expired(config); };
    const request = httpClient.get("/old").catch((error: unknown) => error);
    invalidateSession();
    response.resolve();
    await request;
    expect(authApi.refresh).not.toHaveBeenCalled();
  });
  it.each(["forgot", "reset"])("strips explicit and stale bearer from public %s and never refreshes", async (route) => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      expect(config.headers.has("Authorization")).toBe(false);
      return expired(config);
    });
    httpClient.defaults.adapter = adapter;
    await expect(httpClient.post(`/api/auth/password/${route}`, {}, { headers: { Authorization: "Bearer explicit" } })).rejects.toMatchObject({ code: "AUTH_ACCESS_TOKEN_INVALID" });
    expect(authApi.refresh).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledOnce();
  });
  it.each([
    "/api/auth/refresh",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/logout",
  ])("auth endpoint %s never triggers refresh", async (path) => {
    httpClient.defaults.adapter = async (config) => expired(config);
    await expect(httpClient.post(path, {})).rejects.toMatchObject({ code: "AUTH_ACCESS_TOKEN_INVALID" });
    expect(authApi.refresh).not.toHaveBeenCalled();
  });
});

it("invalidates the current session when refresh fails", async () => {
  vi.mocked(authApi.refresh).mockRejectedValue(new Error("revoked"));
  httpClient.defaults.adapter = async (config) => expired(config);
  await expect(httpClient.get("/protected")).rejects.toMatchObject({ code: "AUTH_ACCESS_TOKEN_INVALID" });
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().status).toBe("unauthenticated");
});
