"use client";

import { useEffect, useRef, useState } from "react";
import { useAnswerStore } from "./answer-store";
import {
  saveAnswer,
  type AnswerPayload,
  type SaveAnswerRequest,
  type SaveAnswerResponse,
} from "@/lib/api/student-attempt";
import type { NormalizedApiError } from "@/lib/api";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "blocked";

const DEBOUNCE_MS = 1500;
/** When this many ms or fewer remain, saves are instant (0 debounce). */
const URGENT_THRESHOLD_MS = 5000;

function generateClientId(): string {

function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Autosave hook — subscribes to the answer-store and debounces per-question
 * saves via PUT /api/attempts/{attemptId}/answers.
 *
 * **Sequence guard (core invariant):**
 *   - `sequenceNumber` sent = `store.answers[qid].sequence + 1` (always >= 1).
 *   - On response (accepted OR stale): `markSaved(qid, currentSequenceNumber, sentPayload)`
 *     syncs the sequence and clears dirty ONLY if the payload hasn't changed
 *     since the save was sent (edit-during-flight → dirty stays → re-debounce).
 *
 * **Single in-flight per question:** a qid already being saved won't start a
 * second PUT; edits during flight are captured by the markSaved dirty check +
 * an explicit re-debounce in the success handler.
 *
 * **409 ATTEMPT_DEADLINE_EXCEEDED / ATTEMPT_INVALID_STATE → blocked:** all
 * timers cleared, status="blocked", no further saves.
 *
 * Call this hook ONLY when the attempt status is IN_PROGRESS.
 */
export function useAutosaveAnswers(attemptId: number, deadlineMs?: number): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>("idle");

  const clientId = useRef<string>("");
  const inFlight = useRef<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const urgentRef = useRef(false);

  // When the deadline is near, switch to instant saves (no debounce).
  useEffect(() => {
    if (!deadlineMs) return;
    const check = () => {
      const remaining = deadlineMs - Date.now();
      urgentRef.current = remaining <= URGENT_THRESHOLD_MS;
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [deadlineMs]);
  const blocked = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const store = useAnswerStore;

    // Reset attempt-scoped refs on (re)mount or attemptId change — prevents
    // a blocked/dead state from a previous attempt from leaking into the new one.
    blocked.current = false;
    inFlight.current = new Set();
    clientId.current = generateClientId();

    // Capture the timers Map locally for cleanup (react-hooks/exhaustive-deps).
    const timersMap = timers.current;

    async function fireSave(qid: number) {
      if (blocked.current || inFlight.current.has(qid)) return;
      const entry = store.getState().answers[qid];
      if (!entry || !entry.dirty) return;

      // Capture the payload at send-time for the markSaved comparison.
      const sentPayload: AnswerPayload = entry.payload;
      const seq = entry.sequence + 1; // always >= 1
      inFlight.current.add(qid);
      setStatus("saving");

      try {
        const req: SaveAnswerRequest = {
          attemptQuestionId: qid,
          answerPayload: sentPayload,
          sequenceNumber: seq,
          clientInstanceId: clientId.current,
        };
        const res: SaveAnswerResponse = await saveAnswer(attemptId, req);

        // Sync sequence + clear dirty ONLY if payload unchanged since send.
        store.getState().markSaved(qid, res.currentSequenceNumber, sentPayload);
        inFlight.current.delete(qid);

        if (blocked.current) return;

        // accepted=false (STALE_SEQUENCE) is normal — not an error.
        setStatus("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(
          () => setStatus((s) => (s === "saved" ? "idle" : s)),
          2000
        );

        // Edit-during-flight: if markSaved left the entry dirty (payload changed
        // while the save was in flight), start a new debounce.
        const after = store.getState().answers[qid];
        if (after?.dirty && !blocked.current) {
          startDebounce(qid);
        }
      } catch (err) {
        inFlight.current.delete(qid);
        const norm = err as NormalizedApiError | undefined;

        if (
          norm?.kind === "api" &&
          (norm.code === "ATTEMPT_DEADLINE_EXCEEDED" ||
            norm.code === "ATTEMPT_INVALID_STATE")
        ) {
          // Irrecoverable — stop all autosave for this attempt.
          blocked.current = true;
          timers.current.forEach((t) => clearTimeout(t));
          timers.current.clear();
          setStatus("blocked");
        } else {
          // Network error or 400 — not blocked; next edit will re-debounce.
          setStatus("error");
        }
      }
    }

    function startDebounce(qid: number) {
      if (blocked.current) return;
      // When urgent (deadline near), save instantly — no debounce delay.
      const delay = urgentRef.current ? 0 : DEBOUNCE_MS;
      const existing = timers.current.get(qid);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.current.delete(qid);
        void fireSave(qid);
      }, delay);
      timers.current.set(qid, timer);
    }

    // Subscribe: when any answer entry changes AND is dirty AND not in-flight → debounce.
    const unsubscribe = store.subscribe((state, prevState) => {
      if (blocked.current) return;
      for (const key of Object.keys(state.answers)) {
        const qid = Number(key);
        const entry = state.answers[qid];
        const prev = prevState.answers[qid];
        if (!entry?.dirty || inFlight.current.has(qid)) continue;

        // Only (re)start debounce if THIS qid's entry changed.
        const changed =
          !prev ||
          prev.payload !== entry.payload ||
          prev.dirty !== entry.dirty;
        if (changed) {
          startDebounce(qid);
        }
      }
    });

    return () => {
      unsubscribe();
      timersMap.forEach((t) => clearTimeout(t));
      timersMap.clear();
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [attemptId]);

  return status;
}
