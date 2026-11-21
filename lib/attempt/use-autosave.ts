"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { payloadEqual, useAnswerStore } from "./answer-store";
import {
  saveAnswer,
  getAttemptDetail,
  type AnswerPayload,
  type SaveAnswerRequest,
  type SaveAnswerResponse,
} from "@/lib/api/student-attempt";
import type { NormalizedApiError } from "@/lib/api";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "conflict" | "blocked";

const DEBOUNCE_MS = 1500;
/** When this many ms or fewer remain, saves are instant (0 debounce). */
const URGENT_THRESHOLD_MS = 5000;

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
 *   - Only an accepted save can clear dirty. A stale response is reconciled
 *     against the server answer; a different answer requires learner choice.
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
export function useAutosaveAnswers(attemptId: number, deadlineMs?: number): {
  status: AutosaveStatus;
  retryNow: () => void;
  retryable: boolean;
  validationError: boolean;
} {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [retryable, setRetryable] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const retryRef = useRef<() => void>(() => {});
  const retryNow = useCallback(() => retryRef.current(), []);

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
    const failed = new Map<number, boolean>();
    let active = true;

    function syncFailures() {
      const failures = [...failed.values()];
      setRetryable(failures.some(Boolean));
      setValidationError(failures.some((canRetry) => !canRetry));
    }

    // Capture the timers Map locally for cleanup (react-hooks/exhaustive-deps).
    const timersMap = timers.current;

    async function fireSave(qid: number) {
      if (blocked.current || inFlight.current.has(qid)) return;
      const entry = store.getState().answers[qid];
      if (!entry || !entry.dirty || entry.conflict) return;

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
        if (!active) return;
        if (!res.accepted) {
          // A 200 STALE_SEQUENCE means the sent payload was NOT persisted.
          // Fetch the authoritative answer before deciding whether a lost
          // response or another tab caused it; never blindly overwrite it.
          const detail = await getAttemptDetail(attemptId);
          if (!active) return;
          const saved = detail.questions.find((q) => q.attemptQuestionId === qid)?.savedAnswer;
          const serverSequence = saved?.sequenceNumber ?? res.currentSequenceNumber;
          const serverPayload = (saved?.answerPayload as AnswerPayload) ?? null;
          if (serverSequence < res.currentSequenceNumber) {
            throw new Error("Answer reconciliation returned an older version");
          }
          const local = store.getState().answers[qid];
          if (local && payloadEqual(local.payload, serverPayload)) {
            store.getState().markSaved(qid, serverSequence, local.payload);
          } else {
            store.getState().markConflict(qid, serverSequence, serverPayload);
            setStatus("conflict");
          }
        } else {
          store.getState().markSaved(qid, res.currentSequenceNumber, sentPayload);
        }
        failed.delete(qid);
        syncFailures();
        inFlight.current.delete(qid);

        if (blocked.current) return;
        const after = store.getState().answers[qid];
        if (after?.conflict) return;
        setStatus(failed.size > 0 ? "error" : "saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(
          () => setStatus((s) => (s === "saved" ? "idle" : s)),
          2000
        );

        // Edit-during-flight: if markSaved left the entry dirty (payload changed
        // while the save was in flight), start a new debounce.
        if (after?.dirty && !blocked.current) {
          startDebounce(qid);
        }
      } catch (err) {
        if (!active) return;
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
          failed.clear();
          syncFailures();
          setStatus("blocked");
        } else {
          // Keep the answer dirty and offer an explicit retry for transient
          // failures. Validation errors require an edit instead.
          const canRetry = !norm?.kind || norm.kind === "network" ||
            ((norm.kind === "http" || norm.kind === "api") && norm.status >= 500) ||
            norm.kind === "unknown";
          failed.set(qid, canRetry);
          syncFailures();
          setStatus("error");
          const latest = store.getState().answers[qid];
          if (latest && !latest.conflict && !blocked.current &&
              !payloadEqual(latest.payload, sentPayload)) {
            startDebounce(qid);
          }
        }
      }
    }

    function startDebounce(qid: number) {
      if (blocked.current) return;
      if (failed.delete(qid)) {
        syncFailures();
        setStatus("saving");
      }
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

    retryRef.current = () => {
      for (const [qid, canRetry] of failed) {
        if (!canRetry) continue;
        const entry = store.getState().answers[qid];
        if (!entry?.dirty || entry.conflict) continue;
        const pending = timers.current.get(qid);
        if (pending) clearTimeout(pending);
        timers.current.delete(qid);
        void fireSave(qid);
      }
    };

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
          prev.dirty !== entry.dirty ||
          prev.conflict !== entry.conflict ||
          prev.sequence !== entry.sequence;
        if (changed) {
          startDebounce(qid);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
      timersMap.forEach((t) => clearTimeout(t));
      timersMap.clear();
      if (savedTimer.current) clearTimeout(savedTimer.current);
      retryRef.current = () => {};
    };
  }, [attemptId]);

  return { status, retryNow, retryable, validationError };
}
