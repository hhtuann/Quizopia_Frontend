"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { useAuth } from "@/hooks/useAuth";

/**
 * Active-view UI preference for dual-capability accounts (Task: User Menu &
 * Role Switching UX).
 *
 * A user holding BOTH the TEACHER and STUDENT roles sees teacher and student
 * navigation mixed together. This store records which of the two views they
 * are currently working in, so the sidebar/dashboard/mobile drawer show one
 * coherent set at a time (`navItemsForRoles(roles, activeView)`).
 *
 * This is a UI preference ONLY — exactly like `lib/workspace/store.ts`:
 * - never sent to the backend for authorization (route guards + the API
 *   remain the security boundary),
 * - the JWT / user roles are NEVER modified,
 * - single-role accounts ignore it entirely (`useActiveView` returns a null
 *   view for them, so nothing changes for existing users).
 *
 * `transition` drives the full-screen switch overlay: set when a switch
 * starts, cleared by the shell once navigation + minimum data settled (or by
 * the watchdog on failure — see AppShell).
 */

export type ViewRole = "TEACHER" | "STUDENT";

const STORAGE_KEY = "quizopia.activeView";

interface ViewPreferenceState {
  activeView: ViewRole | null;
  hydrated: boolean;
  /** In-flight view switch the overlay is covering (null = none). */
  transition: { to: ViewRole } | null;
  /** Restore from localStorage once, on the client (call from a component). */
  hydrate: () => void;
  setActiveView: (view: ViewRole) => void;
  startTransition: (to: ViewRole) => void;
  endTransition: () => void;
}

function readStoredView(): ViewRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "TEACHER" || raw === "STUDENT" ? raw : null;
  } catch {
    return null;
  }
}

function persistView(view: ViewRole | null): void {
  if (typeof window === "undefined") return;
  try {
    if (view == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // localStorage unavailable (private mode etc.) — preference is best-effort.
  }
}

export const useViewPreference = create<ViewPreferenceState>((set, get) => ({
  activeView: null,
  hydrated: false,
  transition: null,
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    set({ activeView: readStoredView(), hydrated: true });
  },
  setActiveView: (view) => {
    set({ activeView: view, hydrated: true });
    persistView(view);
  },
  startTransition: (to) => set({ transition: { to } }),
  endTransition: () => set({ transition: null }),
}));

/**
 * Resolve the effective view for the signed-in user.
 *
 * - `canSwitch` is true only when the account genuinely holds BOTH roles —
 *   the switch menu item is hidden otherwise (no capability = no action).
 * - Dual accounts default to the Teacher view (the previous behaviour for
 *   mixed dashboards) until/unless a stored preference says otherwise.
 * - Single-role accounts get `effectiveView: null` → navigation behaves
 *   exactly as before this feature existed.
 */
export function useActiveView(): {
  canSwitch: boolean;
  effectiveView: ViewRole | null;
} {
  const { user } = useAuth();
  const activeView = useViewPreference((s) => s.activeView);
  const hydrate = useViewPreference((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const roles = user?.roles ?? [];
  const canSwitch = roles.includes("TEACHER") && roles.includes("STUDENT");
  if (!canSwitch) return { canSwitch: false, effectiveView: null };
  // Before hydration completes this renders the default view — same
  // SSR/client output, and a stored value (if any) applies right after
  // mount without a redirect loop.
  return { canSwitch, effectiveView: activeView ?? "TEACHER" };
}
