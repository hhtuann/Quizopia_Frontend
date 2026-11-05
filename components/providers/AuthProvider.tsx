"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { httpClient } from "@/lib/api";
import { authApi, initAuth, useAuthStore } from "@/lib/auth";
import type {
  CurrentUserResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  TokenResponse,
} from "@/lib/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  login: (req: LoginRequest) => Promise<CurrentUserResponse>;
  register: (req: RegisterRequest) => Promise<RegisterResponse>;
  /** Identity-M2: re-fetches /api/auth/me into the store (e.g. after a role upgrade). */
  refreshUser: () => Promise<CurrentUserResponse>;
  /**
   * Review M1-04: the SINGLE session-completion path for any token source
   * (password login, OAuth exchange). Updates access token, user AND
   * AuthProvider status together, so Zustand, the provider and the route
   * guards can never disagree after an OAuth callback.
   */
  completeLogin: (token: TokenResponse) => Promise<CurrentUserResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth boot + session provider.
 *
 * On mount (client only):
 *   1. `initAuth(httpClient)` — wires the access-token getter + the FE3
 *      single-flight refresh interceptor (idempotent; safe under StrictMode).
 *   2. Try silent session hydration: `refresh()` → `me()`. On success the user
 *      is authenticated; on failure (no valid refresh cookie) → unauthenticated.
 *
 * Hydration-safety: `status` starts at `"loading"` for the FIRST render (SSR +
 * first client paint), so no auth-dependent UI renders during SSR. Status only
 * changes inside the effect (after mount), so server and client first-paint
 * match — no hydration mismatch. Pages gate on `status` client-side.
 *
 * Race safety (review M1-04): the silent-boot refresh and an OAuth callback
 * completing at the same moment are serialized through a monotonic session
 * sequence — only the LATEST completion may touch store/status, so a stale
 * `refresh()` failure can never clobber a fresh OAuth login (and vice versa).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const booted = useRef(false);
  const sessionSeq = useRef(0);

  useEffect(() => {
    // Guard against React StrictMode double-invoke in dev (in addition to
    // initAuth's own idempotent guard).
    if (booted.current) return;
    booted.current = true;

    void (async () => {
      initAuth(httpClient);
      const seq = ++sessionSeq.current;
      try {
        const token = await authApi.refresh();
        if (seq !== sessionSeq.current) return; // superseded by a newer login
        useAuthStore.getState().setAccessToken(token.accessToken);
        const me = await authApi.me();
        if (seq !== sessionSeq.current) return;
        useAuthStore.getState().setUser(me);
        setStatus("authenticated");
      } catch {
        // refresh failed (no session / expired / revoked) → not logged in.
        // Swallowed deliberately: unauthenticated is a normal boot state —
        // unless a newer session (e.g. OAuth callback) already landed.
        if (seq !== sessionSeq.current) return;
        useAuthStore.getState().clearAuth();
        setStatus("unauthenticated");
      }
    })();
  }, []);

  /** Shared completion: token → store, then identity → store + status. */
  const completeLogin = useCallback(async (token: TokenResponse) => {
    const seq = ++sessionSeq.current;
    useAuthStore.getState().setAccessToken(token.accessToken);
    const me = await authApi.me();
    if (seq !== sessionSeq.current) {
      // A newer session superseded this one; keep the newer state untouched.
      return me;
    }
    useAuthStore.getState().setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const login = useCallback(
    async (req: LoginRequest) => completeLogin(await authApi.login(req)),
    [completeLogin],
  );

  const register = useCallback(async (req: RegisterRequest) => {
    // 201 RegisterResponse; backend returns no token → caller redirects to /login.
    return authApi.register(req);
  }, []);

  /** Identity-M2: pulls the freshest identity (roles) into the store. */
  const refreshUser = useCallback(async () => {
    const seq = ++sessionSeq.current;
    const me = await authApi.me();
    if (seq !== sessionSeq.current) return me;
    useAuthStore.getState().setUser(me);
    return me;
  }, []);

  const qc = useQueryClient();

  const logout = useCallback(async () => {
    // Invalidate any in-flight session completion before clearing.
    ++sessionSeq.current;
    try {
      await authApi.logout();
    } finally {
      // Clear local state regardless of network result (cookie cleared server-side on 204).
      useAuthStore.getState().clearAuth();
      qc.clear();
      setStatus("unauthenticated");
    }
  }, [qc]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, login, register, refreshUser, completeLogin, logout }),
    [status, login, register, refreshUser, completeLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Internal hook — use `useAuth` from `@/hooks/useAuth` in components. */
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("AuthProvider is missing — wrap the tree with <AuthProvider>.");
  }
  return ctx;
}
