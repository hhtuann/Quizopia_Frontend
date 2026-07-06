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
import { httpClient } from "@/lib/api";
import { authApi, initAuth, useAuthStore } from "@/lib/auth";
import type {
  CurrentUserResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
} from "@/lib/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  login: (req: LoginRequest) => Promise<CurrentUserResponse>;
  register: (req: RegisterRequest) => Promise<RegisterResponse>;
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
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const booted = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke in dev (in addition to
    // initAuth's own idempotent guard).
    if (booted.current) return;
    booted.current = true;

    void (async () => {
      initAuth(httpClient);
      try {
        const token = await authApi.refresh();
        useAuthStore.getState().setAccessToken(token.accessToken);
        const me = await authApi.me();
        useAuthStore.getState().setUser(me);
        setStatus("authenticated");
      } catch {
        // refresh failed (no session / expired / revoked) → not logged in.
        // Swallowed deliberately: unauthenticated is a normal boot state.
        useAuthStore.getState().clearAuth();
        setStatus("unauthenticated");
      }
    })();
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const token = await authApi.login(req);
    useAuthStore.getState().setAccessToken(token.accessToken);
    const me = await authApi.me();
    useAuthStore.getState().setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    // 201 RegisterResponse; backend returns no token → caller redirects to /login.
    return authApi.register(req);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Clear local state regardless of network result (cookie cleared server-side on 204).
      useAuthStore.getState().clearAuth();
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, login, register, logout }),
    [status, login, register, logout]
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
