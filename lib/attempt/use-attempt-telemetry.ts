"use client";

import { useCallback, useEffect, useRef } from "react";
import { payloadEqual, useAnswerStore } from "./answer-store";
import {
  createAttemptTelemetry,
  markAttemptVisited,
  type AttemptTelemetry,
} from "./telemetry";
import type {
  ActivityEventInput,
  ClientActivityEventType,
  IngestActivityEventsResponse,
} from "@/lib/api/monitoring";
import { useAuthStore } from "@/lib/auth/store";
import type { WsStatus } from "@/lib/realtime/use-stomp-connection";
import type { AutosaveStatus } from "./use-autosave";

/**
 * Wire the module-scope telemetry singleton into an IN_PROGRESS attempt page.
 *
 * All listeners are attached ONCE per (attemptId, clientInstanceId) in an
 * effect with a full cleanup — re-renders never re-subscribe or duplicate
 * events (the emitter itself lives outside React). Wired sources:
 *
 *   - PAGE_RELOADED — sessionStorage visit marker on mount;
 *   - TAB_HIDDEN / TAB_VISIBLE — document visibilitychange;
 *   - WINDOW_FOCUS_LOST / GAINED — window blur/focus;
 *   - ANSWER_SELECTED / CHANGED / CLEARED — answer-store diff (prior-state
 *     comparison: none→SELECTED, value→CHANGED, to-null→CLEARED; hydrate is
 *     never an event; metadata carries {questionId} only — NO payloads);
 *   - QUESTION_FLAGGED / UNFLAGGED — answer-store flag diff;
 *   - CONNECTION_LOST / RESTORED — STOMP status transitions (via `signals`);
 *   - AUTOSAVE_FAILED — autosave status transition to "error" (via `signals`).
 *
 * QUESTION_NAVIGATED is triggered by the caller (AttemptShell's navigator)
 * via the returned `track` — navigation is not observable from the store.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const HIDE_BATCH_SIZE = 25;

/** Synchronous pagehide sender: fetch keepalive, ≤25-event batches, Bearer auth. */
function sendTelemetryKeepalive(
  attemptId: number,
  events: ActivityEventInput[]
): Promise<IngestActivityEventsResponse> {
  const token = useAuthStore.getState().accessToken;
  for (let i = 0; i < events.length; i += HIDE_BATCH_SIZE) {
    void fetch(`${API_BASE_URL}/api/attempts/${attemptId}/activity-events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events: events.slice(i, i + HIDE_BATCH_SIZE) }),
    }).catch(() => {
      // Best-effort by contract (#81): an unload-time failure is dropped.
    });
  }
  return Promise.resolve({ acceptedCount: events.length, duplicateCount: 0, results: [] });
}

export function useAttemptTelemetry(
  attemptId: number,
  clientInstanceId: string,
  signals?: {
    wsStatus?: WsStatus;
    autosaveStatus?: AutosaveStatus;
  }
): {
  track: (type: ClientActivityEventType, metadata?: Record<string, unknown>) => void;
  flush: () => void;
} {
  const telemetryRef = useRef<AttemptTelemetry | null>(null);

  const track = useCallback(
    (type: ClientActivityEventType, metadata?: Record<string, unknown>) => {
      telemetryRef.current?.track(type, metadata);
    },
    []
  );
  const flush = useCallback(() => {
    telemetryRef.current?.flush();
  }, []);

  useEffect(() => {
    const telemetry = createAttemptTelemetry(attemptId, {
      clientInstanceId,
      // Unload-safe final drain (#81 reload semantics): a reload tears down
      // JS before unmount effects run — fetch keepalive carries the last
      // <flushInterval window to the server without blocking the unload.
      sendOnHide: sendTelemetryKeepalive,
    });
    telemetryRef.current = telemetry;

    if (markAttemptVisited(attemptId)) {
      telemetry.track("PAGE_RELOADED");
    }

    // Tab visibility → TAB_HIDDEN / TAB_VISIBLE.
    const onVisibility = () =>
      telemetry.track(document.hidden ? "TAB_HIDDEN" : "TAB_VISIBLE");
    document.addEventListener("visibilitychange", onVisibility);

    // Window focus → WINDOW_FOCUS_LOST / WINDOW_FOCUS_GAINED.
    const onWindowFocus = () => telemetry.track("WINDOW_FOCUS_GAINED");
    const onWindowBlur = () => telemetry.track("WINDOW_FOCUS_LOST");
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);

    // Answer-store diff → ANSWER_* + QUESTION_FLAGGED/UNFLAGGED. Hydrated
    // entries (first appearance) are initial state, never user intent.
    const unsubscribe = useAnswerStore.subscribe((state, prev) => {
      // Hydration (page load / reconnect refetch) replaces the store wholesale
      // — that is server state, never user intent: skip the diff entirely.
      if (state.hydrateGeneration !== prev.hydrateGeneration) return;
      for (const key of Object.keys(state.answers)) {
        const qid = Number(key);
        const entry = state.answers[qid];
        const before = prev.answers[qid];
        if (!entry || !before) continue;
        if (payloadEqual(before.payload, entry.payload)) continue;
        if (entry.payload == null) {
          telemetry.track("ANSWER_CLEARED", { questionId: qid });
        } else if (before.payload == null) {
          telemetry.track("ANSWER_SELECTED", { questionId: qid });
        } else {
          telemetry.track("ANSWER_CHANGED", { questionId: qid });
        }
      }
      for (const key of Object.keys(state.flagged)) {
        const qid = Number(key);
        if (state.flagged[qid] && !prev.flagged[qid]) {
          telemetry.track("QUESTION_FLAGGED", { questionId: qid });
        }
      }
      for (const key of Object.keys(prev.flagged)) {
        const qid = Number(key);
        if (!state.flagged[qid] && prev.flagged[qid]) {
          telemetry.track("QUESTION_UNFLAGGED", { questionId: qid });
        }
      }
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("blur", onWindowBlur);
      unsubscribe();
      telemetryRef.current = null;
      telemetry.dispose();
    };
  }, [attemptId, clientInstanceId]);

  // STOMP status transitions → CONNECTION_LOST / CONNECTION_RESTORED.
  // The first-ever connect is not a "restore".
  const wsStatus = signals?.wsStatus;
  const prevWsRef = useRef<WsStatus | undefined>(undefined);
  const everConnectedRef = useRef(false);
  useEffect(() => {
    const prev = prevWsRef.current;
    prevWsRef.current = wsStatus;
    if (wsStatus === undefined || prev === undefined || prev === wsStatus) {
      return;
    }
    if (wsStatus === "connected") {
      if (everConnectedRef.current) track("CONNECTION_RESTORED");
      everConnectedRef.current = true;
    } else if (prev === "connected") {
      track("CONNECTION_LOST");
    }
  }, [wsStatus, track]);

  // Autosave error transitions → AUTOSAVE_FAILED (best-effort signal; the
  // telemetry request itself never participates in the autosave path).
  const autosaveStatus = signals?.autosaveStatus;
  const prevAutosaveRef = useRef<AutosaveStatus | undefined>(undefined);
  useEffect(() => {
    const prev = prevAutosaveRef.current;
    prevAutosaveRef.current = autosaveStatus;
    if (autosaveStatus !== "error" || prev === "error") return;
    track("AUTOSAVE_FAILED");
  }, [autosaveStatus, track]);

  return { track, flush };
}

