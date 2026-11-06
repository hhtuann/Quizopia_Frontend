"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { httpClient } from "@/lib/api";
import { authApi, initAuth, useAuthStore } from "@/lib/auth";
import { assertCurrentSession, beginSession, invalidateSession, isCurrentSession, registerSessionCleanup, sessionGeneration, type AuthStatus } from "@/lib/auth/store";
import type { CurrentUserResponse, LoginRequest, RegisterRequest, RegisterResponse, TokenResponse } from "@/lib/auth";

export type { AuthStatus } from "@/lib/auth/store";
export interface AuthContextValue {
  status: AuthStatus;
  login: (req: LoginRequest) => Promise<CurrentUserResponse>;
  register: (req: RegisterRequest) => Promise<RegisterResponse>;
  refreshUser: () => Promise<CurrentUserResponse>;
  completeLogin: (token: TokenResponse, generation: number) => Promise<CurrentUserResponse>;
  logout: () => Promise<void>;
  invalidateSession: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const booted = useRef(false);
  const qc = useQueryClient();
  useEffect(() => registerSessionCleanup(() => qc.clear()), [qc]);

  const completeLogin = useCallback(async (token: TokenResponse, generation: number) => {
    assertCurrentSession(generation);
    useAuthStore.getState().setAccessToken(token.accessToken);
    try {
      const me = await authApi.me();
      assertCurrentSession(generation);
      useAuthStore.getState().setUser(me);
      return me;
    } catch (error) {
      assertCurrentSession(generation);
      invalidateSession();
      throw error;
    }
  }, []);

  useEffect(() => {
    initAuth(httpClient);
    if (booted.current) return;
    booted.current = true;
    // Child OAuth effects may already have begun acquisition before this effect.
    if (useAuthStore.getState().status !== "loading") return;
    const generation = sessionGeneration();
    void (async () => {
      try {
        const token = await authApi.refresh();
        await completeLogin(token, generation);
      } catch {
        if (isCurrentSession(generation)) invalidateSession();
      }
    })();
  }, [completeLogin]);

  const login = useCallback(async (req: LoginRequest) => {
    const generation = beginSession();
    let token: TokenResponse;
    try {
      token = await authApi.login(req);
    } catch (error) {
      assertCurrentSession(generation);
      invalidateSession();
      throw error;
    }
    return completeLogin(token, generation);
  }, [completeLogin]);
  const register = useCallback((req: RegisterRequest) => authApi.register(req), []);
  const refreshUser = useCallback(async () => {
    const generation = sessionGeneration();
    try {
      const me = await authApi.me();
      assertCurrentSession(generation);
      useAuthStore.getState().setUser(me);
      return me;
    } catch (error) {
      assertCurrentSession(generation);
      throw error;
    }
  }, []);
  const logout = useCallback(async () => {
    // Dispatch with the old bearer, then invalidate synchronously. Never let a
    // late logout response clear a newer session.
    const request = authApi.logout();
    invalidateSession();
    await request;
  }, []);
  const value = useMemo<AuthContextValue>(() => ({ status, login, register, refreshUser, completeLogin, logout, invalidateSession }), [status, login, register, refreshUser, completeLogin, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider is missing — wrap the tree with <AuthProvider>.");
  return ctx;
}
