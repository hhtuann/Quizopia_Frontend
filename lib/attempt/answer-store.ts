import { create } from "zustand";
import type {
  AnswerPayload,
  DetailQuestionView,
} from "@/lib/api/student-attempt";

/**
 * In-memory answer store (zustand). Holds the student's working answers keyed
 * by `attemptQuestionId`. This is the SEAM for FE11 (autosave) and FE12
 * (submit) — those checkpoints will read from this store and call the API.
 *
 * FE10 does NOT call any API from this store. Answers are lost on page unmount
 * until FE11 wires autosave.
 */

export interface AnswerEntry {
  payload: AnswerPayload;
  /** From the server's savedAnswer.sequenceNumber (0 if new). FE11 increments on save. */
  sequence: number;
  dirty: boolean;
}

interface AnswerStoreState {
  answers: Record<number, AnswerEntry>;
  /**
   * Increments on every hydrate() — subscribers (telemetry) compare it to
   * detect wholesale replacement (re-fetch/refocus) vs user edits, so a
   * re-hydration never fabricates UNFLAGGED/CLEARED/CHANGED events.
   */
  hydrateGeneration: number;
  /** Question ids the student flagged for review. */
  flagged: Record<number, true>;
  hydrate: (questions: DetailQuestionView[]) => void;
  /** Set/update an answer payload for one question. Marks dirty. */
  setAnswer: (attemptQuestionId: number, payload: AnswerPayload) => void;
  /** Clear an answer (payload → null). Marks dirty. */
  clearAnswer: (attemptQuestionId: number) => void;
  /** Toggle the flag on a question (mark for review). */
  toggleFlag: (attemptQuestionId: number) => void;
  /** Reset the entire store (used on unmount or when switching attempts). */
  reset: () => void;
  /** Sync sequence from a save response; clear dirty ONLY if payload hasn't changed since send (edit-during-flight). */
  markSaved: (qid: number, currentSequenceNumber: number, sentPayload: AnswerPayload) => void;
}

export const useAnswerStore = create<AnswerStoreState>((set) => ({
  answers: {},
  hydrateGeneration: 0,
  flagged: {},
  hydrate: (questions) => {
    const next: Record<number, AnswerEntry> = {};
    for (const q of questions) {
      next[q.attemptQuestionId] = {
        payload: (q.savedAnswer?.answerPayload as AnswerPayload) ?? null,
        sequence: q.savedAnswer?.sequenceNumber ?? 0,
        dirty: false,
      };
    }
    set((state) => ({
      answers: next,
      flagged: {},
      hydrateGeneration: state.hydrateGeneration + 1,
    }));
  },

  toggleFlag: (qid) =>
    set((state) => {
      const next = { ...state.flagged };
      if (next[qid]) delete next[qid];
      else next[qid] = true;
      return { flagged: next };
    }),

  setAnswer: (id, payload) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [id]: {
          payload,
          sequence: state.answers[id]?.sequence ?? 0,
          dirty: true,
        },
      },
    })),

  clearAnswer: (id) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [id]: {
          payload: null,
          sequence: state.answers[id]?.sequence ?? 0,
          dirty: true,
        },
      },
    })),

  reset: () => set({ answers: {} }),

  markSaved: (qid, currentSequenceNumber, sentPayload) =>
    set((state) => {
      const entry = state.answers[qid];
      if (!entry) return state;
      return {
        answers: {
          ...state.answers,
          [qid]: {
            ...entry,
            sequence: currentSequenceNumber,
            dirty: !payloadEqual(entry.payload, sentPayload),
          },
        },
      };
    }),
}));

/** Shallow JSON compare for AnswerPayload (null, or plain objects with primitives/arrays). Exported for the telemetry store-diff (same equality semantics as markSaved). */
export function payloadEqual(a: AnswerPayload, b: AnswerPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
