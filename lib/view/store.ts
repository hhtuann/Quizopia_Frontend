"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Student/Teacher active-view state (Identity-M2, System #14).
 *
 * `activeView` is a **UI preference only** — never an authorization signal.
 * Every API call re-checks the effective roles server-side; this module only
 * decides which navigation set the user sees.
 *
 * Persistence is per user identity (`quizopia.activeView.<userId>`), so one
 * account's preference never leaks into the next login. Fallback rules keep
 * the view consistent with the real roles (e.g. losing TEACHER after a revoke
 * falls back to Student when STUDENT remains; legacy Teacher-only accounts
 * stay in the Teacher view because they lack the STUDENT role entirely).
 *
 * Implementation: a tiny external store read through `useSyncExternalStore`.
 * The snapshot is memoized per (user, roles, override) key so React sees a
 * stable value between renders; the server snapshot is the neutral default,
 * keeping SSR and first client paint identical.
 */

export type ViewMode = "student" | "teacher";

export function viewStorageKey(userId: number): string {
  return `quizopia.activeView.${userId}`;
}

export function canStudentView(roles?: string[] | null): boolean {
  return !!roles?.includes("STUDENT");
}

export function canTeacherView(roles?: string[] | null): boolean {
  return !!roles?.includes("TEACHER");
}

/**
 * The view the given roles permit, honoring the stored preference when it is
 * still valid. Defaults: dual-role users start as Student (they registered as
 * learners); Teacher-only users (legacy accounts, no STUDENT) stay Teacher.
 */
export function effectiveView(
  roles: string[] | null | undefined,
  stored: ViewMode | null,
): ViewMode {
  const student = canStudentView(roles);
  const teacher = canTeacherView(roles);
  if (stored === "teacher" && teacher) return "teacher";
  if (stored === "student" && student) return "student";
  if (student) return "student";
  if (teacher) return "teacher";
  // Admins without STUDENT/TEACHER have no view-specific nav; either value
  // renders the same shared items — keep "student" as the neutral default.
  return "student";
}

/** Reads the persisted preference of a user id (SSR-safe). */
export function readStoredView(userId: number): ViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(viewStorageKey(userId));
    return raw === "student" || raw === "teacher" ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredView(userId: number, view: ViewMode): void {
  try {
    window.localStorage.setItem(viewStorageKey(userId), view);
  } catch {
    // localStorage unavailable: the preference just stays in memory.
  }
}

// ---------- external store ----------

const listeners = new Set<() => void>();
/** In-flight override set by changeView (also mirrored to localStorage). */
let override: { userId: number; view: ViewMode } | null = null;
/** Memoized snapshot; must stay referentially stable between notifications. */
let snapshotCache: { key: string; value: ViewMode } | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshotFor(userId: number | undefined, roles: string[] | null): ViewMode {
  if (userId == null) {
    // Signed out: neutral default, never persisted or read.
    return "student";
  }
  const stored = override && override.userId === userId
    ? override.view
    : readStoredView(userId);
  const key = `${userId}|${roles?.join(",") ?? ""}|${stored ?? "-"}`;
  if (snapshotCache?.key === key) {
    return snapshotCache.value;
  }
  const value = effectiveView(roles, stored);
  snapshotCache = { key, value };
  return value;
}

/**
 * React binding: the view is always role-valid (stale states like a revoked
 * TEACHER are clamped by `effectiveView`) and persisted per user id.
 */
export function useActiveView() {
  const { user } = useAuth();
  const userId = user?.id;
  const roles = user?.roles ?? null;

  const view = useSyncExternalStore(
    subscribe,
    () => snapshotFor(userId, roles),
    () => "student" as ViewMode,
  );

  const changeView = useCallback((next: ViewMode) => {
    override = null; // reset, then set below with notify
    if (userId != null) {
      writeStoredView(userId, next);
      override = { userId, view: next };
    }
    notify();
  }, [userId]);

  return {
    view,
    canStudent: canStudentView(roles),
    canTeacher: canTeacherView(roles),
    /** True when both views are genuinely reachable for this account. */
    canSwitch: canStudentView(roles) && canTeacherView(roles),
    changeView,
  };
}
