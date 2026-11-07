// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuthContext, type AuthContextValue } from "./AuthProvider";
import { authApi } from "@/lib/auth/api";
import { beginSession, invalidateSession, StaleSessionError, useAuthStore } from "@/lib/auth/store";
import { useWorkspacePreference } from "@/lib/workspace/store";
import type { CurrentUserResponse, TokenResponse } from "@/lib/auth/types";
vi.mock("@/lib/auth/api", () => ({ authApi: { refresh: vi.fn(), me: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() } }));
function deferred<T>() {
  return Promise.withResolvers<T>();
}

const user = { id: 1, username: "ada", displayName: "Ada", email: "ada@example.com", phone: null, status: "ACTIVE", emailVerified: true, googleLinked: true, roles: [], permissions: [] } satisfies CurrentUserResponse;
const token = { accessToken: "token" } as TokenResponse;
let auth: AuthContextValue;
function Probe() {
  return <ProbeInner onReady={(value) => { auth = value; }} />;
}
function ProbeInner({ onReady }: { onReady: (value: AuthContextValue) => void }) {
  const value = useAuthContext();
  onReady(value);
  return <span>{value.status}</span>;
}
function mount() {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
  return qc;
}
beforeEach(() => {
  vi.resetAllMocks();
  invalidateSession();
  vi.mocked(authApi.me).mockResolvedValue(user);
});
afterEach(cleanup);
describe("shared auth generation", () => {
  it.each(["success", "failure"])("ignores stale boot %s after login", async (outcome) => {
    const boot = deferred<TokenResponse>();
    vi.mocked(authApi.refresh).mockReturnValue(boot.promise);
    useAuthStore.setState({ status: "loading" });
    mount();
    vi.mocked(authApi.login).mockResolvedValue(token);
    await act(async () => { await auth.login({ username: "ada", password: "password" } as never); });
    await act(async () => { if (outcome === "success") boot.resolve({ ...token, accessToken: "old" }); else boot.reject(new Error("old")); });
    expect(useAuthStore.getState().accessToken).toBe("token");
    expect(auth.status).toBe("authenticated");
  });
  it.each(["success", "failure"])("rejects stale login %s", async (outcome) => {
    mount();
    const pending = deferred<TokenResponse>();
    vi.mocked(authApi.login).mockReturnValue(pending.promise);
    let result!: Promise<unknown>;
    act(() => { result = auth.login({} as never).catch((error: unknown) => error); });
    act(() => invalidateSession());
    await act(async () => { if (outcome === "success") pending.resolve(token); else pending.reject(new Error("old")); expect(await result).toBeInstanceOf(StaleSessionError); });
    expect(authApi.me).not.toHaveBeenCalled();
    expect(auth.status).toBe("unauthenticated");
  });
  it.each(["success", "failure"])("rejects stale me %s without changing the new session", async (outcome) => {
    mount();
    const me = deferred<CurrentUserResponse>();
    vi.mocked(authApi.me).mockReturnValue(me.promise);
    let result!: Promise<unknown>;
    act(() => { result = auth.refreshUser().catch((error: unknown) => error); });
    act(() => { beginSession(); useAuthStore.getState().setSession({ accessToken: "new", user }); });
    await act(async () => { if (outcome === "success") me.resolve({ ...user, displayName: "old" }); else me.reject(new Error("old")); expect(await result).toBeInstanceOf(StaleSessionError); });
    expect(useAuthStore.getState().user?.displayName).toBe("Ada");
  });
  it("rejects an OAuth token acquired in an invalidated generation before writing it", async () => {
    mount();
    const generation = beginSession();
    invalidateSession();
    await expect(auth.completeLogin(token, generation)).rejects.toBeInstanceOf(StaleSessionError);
    expect(authApi.me).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
  it("clears provider, cache and persisted workspace synchronously before logout settles", async () => {
    const qc = mount();
    const pending = deferred<void>();
    vi.mocked(authApi.logout).mockReturnValue(pending.promise);
    act(() => { useAuthStore.getState().setSession({ accessToken: "old", user }); });
    qc.setQueryData(["private"], user);
    useWorkspacePreference.getState().setActiveWorkspace(42);
    let request!: Promise<void>;
    act(() => { request = auth.logout(); });
    expect(auth.status).toBe("unauthenticated");
    expect(qc.getQueryData(["private"])).toBeUndefined();
    expect(useWorkspacePreference.getState().activeWorkspaceId).toBeNull();
    expect(localStorage.getItem("quizopia.activeWorkspaceId")).toBeNull();
    act(() => { useAuthStore.getState().setSession({ accessToken: "new", user }); });
    await act(async () => { pending.resolve(); await request; });
    expect(useAuthStore.getState().accessToken).toBe("new");
  });
});

it.each(["success", "failure"])("rejects pending OAuth identity %s after invalidation", async (outcome) => {
  mount();
  const me = Promise.withResolvers<CurrentUserResponse>();
  vi.mocked(authApi.me).mockReturnValue(me.promise);
  let result!: Promise<unknown>;
  act(() => {
    result = auth.completeLogin(token, beginSession()).catch((error: unknown) => error);
  });
  act(() => invalidateSession());
  await act(async () => {
    if (outcome === "success") me.resolve(user);
    else me.reject(new Error("old identity failure"));
    expect(await result).toBeInstanceOf(StaleSessionError);
  });
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
  expect(auth.status).toBe("unauthenticated");
});
