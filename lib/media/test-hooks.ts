import type { Room } from "./livekit";

/**
 * Non-production media registry (P4-B test hooks, plan §6). e2e and unit
 * tests assert room lifecycle through `window.__quizopiaMedia` — production
 * builds never populate it (the map stays empty and the global is untouched).
 */

export interface QuizopiaMediaTestHooks {
  /** Live room registered under `scope` (e.g. "attempt"), or null. */
  getRoom(scope: string): Room | null;
}

const rooms = new Map<string, Room | null>();

declare global {
  var __quizopiaMedia: QuizopiaMediaTestHooks | undefined;
}

function exposeHooks(): void {
  if (typeof globalThis.__quizopiaMedia === "undefined") {
    globalThis.__quizopiaMedia = {
      getRoom: (scope: string) => rooms.get(scope) ?? null,
    };
  }
}

/**
 * Register the room for a scope (null clears it). No-op in production
 * builds; the WeakRef-free Map is only ever populated outside production.
 */
export function registerMediaRoom(scope: string, room: Room | null): void {
  if (process.env.NODE_ENV === "production") return;
  if (room === null) rooms.delete(scope);
  else rooms.set(scope, room);
  exposeHooks();
}

/** Test-side getter (mirrors `__quizopiaMedia.getRoom`). */
export function getRegisteredMediaRoom(scope: string): Room | null {
  return rooms.get(scope) ?? null;
}
