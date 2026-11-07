import { create } from "zustand";
import type { CurrentUserResponse } from "./types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";
export interface AuthState {
  accessToken: string | null;
  user: CurrentUserResponse | null;
  status: AuthStatus;
  generation: number;
  setAccessToken: (token: string | null) => void;
  setUser: (user: CurrentUserResponse | null) => void;
  setSession: (session: { accessToken: string; user?: CurrentUserResponse | null }) => void;
  invalidateSession: () => void;
}

const sessionCleanups = new Set<() => void>();
export function registerSessionCleanup(cleanup: () => void): () => void {
  sessionCleanups.add(cleanup);
  return () => { sessionCleanups.delete(cleanup); };
}

/** Tokens and the monotonic session generation live only in memory. */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "loading",
  generation: 0,
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user, status: user ? "authenticated" : "unauthenticated" }),
  setSession: ({ accessToken, user }) => set((state) => ({
    accessToken, user: user ?? state.user,
    status: user || state.user ? "authenticated" : state.status,
  })),
  invalidateSession: () => {
    set((state) => ({ generation: state.generation + 1, accessToken: null, user: null, status: "unauthenticated" }));
    for (const cleanup of sessionCleanups) cleanup();
  },
}));

export const invalidateSession = (): void => useAuthStore.getState().invalidateSession();
export const sessionGeneration = (): number => useAuthStore.getState().generation;
export const isCurrentSession = (generation: number): boolean => generation === sessionGeneration();
export class StaleSessionError extends Error {
  constructor() { super("Session superseded"); this.name = "StaleSessionError"; }
}
export function assertCurrentSession(generation: number): void {
  if (!isCurrentSession(generation)) throw new StaleSessionError();
}
/** Start acquisition BEFORE dispatching login/OAuth, superseding older work. */
export function beginSession(): number {
  invalidateSession();
  return sessionGeneration();
}
export type AuthStore = typeof useAuthStore;
