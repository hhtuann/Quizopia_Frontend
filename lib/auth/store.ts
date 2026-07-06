import { create } from "zustand";
import type { CurrentUserResponse } from "./types";

export interface AuthState {
  /** Access token — in memory ONLY (never persisted to localStorage/sessionStorage). */
  accessToken: string | null;
  /** Current user profile from `GET /api/auth/me` (null until fetched). */
  user: CurrentUserResponse | null;
  setAccessToken: (token: string | null) => void;
  setUser: (user: CurrentUserResponse | null) => void;
  setSession: (session: { accessToken: string; user?: CurrentUserResponse | null }) => void;
  clearAuth: () => void;
}

/**
 * In-memory auth store.
 *
 * - The **access token** lives only in memory; it is never written to
 *   localStorage/sessionStorage.
 * - The **refresh token** is an HttpOnly cookie and is NEVER read into JS
 *   (not stored here, never logged).
 * - Module is pure TS (no `'use client'`, no top-level `window`/`document`);
 *   safe to import from server and client modules. React consumers use the
 *   `useAuthStore` hook; non-React code (interceptors, `initAuth`) reads via
 *   `.getState()`.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAccessToken: (token) => set({ accessToken: token }),
  setUser: (user) => set({ user }),
  setSession: ({ accessToken, user }) =>
    set((state) => ({ accessToken, user: user ?? state.user })),
  clearAuth: () => set({ accessToken: null, user: null }),
}));

/** The store type accepted by `installRefreshInterceptor`. */
export type AuthStore = typeof useAuthStore;
