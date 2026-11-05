"use client";

import { create } from "zustand";

/**
 * Active-workspace UI preference (Phase 1, Task A5).
 *
 * Persisted under "quizopia.activeWorkspaceId". This is a UI preference ONLY —
 * it is never sent to the backend for authorization. It MAY be passed as
 * `workspaceId` when CREATING banks/exams so new content lands in the
 * workspace the teacher is looking at. Default = personal workspace id.
 *
 * SSR-safe: reads localStorage lazily inside actions/guards, never at module
 * init. A null activeId means "not chosen yet" → callers fall back to
 * `personalWorkspaceId` from the workspaces query.
 */

const STORAGE_KEY = "quizopia.activeWorkspaceId";

interface WorkspacePreferenceState {
  activeWorkspaceId: number | null;
  hydrated: boolean;
  /** Restore from localStorage once, on the client (call from a component). */
  hydrate: () => void;
  setActiveWorkspace: (workspaceId: number) => void;
}

function readStoredId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function persistId(workspaceId: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (workspaceId == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(workspaceId));
  } catch {
    // localStorage unavailable (private mode etc.) — preference is best-effort.
  }
}

export const useWorkspacePreference = create<WorkspacePreferenceState>(
  (set, get) => ({
    activeWorkspaceId: null,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated || typeof window === "undefined") return;
      set({ activeWorkspaceId: readStoredId(), hydrated: true });
    },
    setActiveWorkspace: (workspaceId) => {
      set({ activeWorkspaceId: workspaceId, hydrated: true });
      persistId(workspaceId);
    },
  })
);
