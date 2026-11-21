import { beforeEach, describe, expect, it } from "vitest";
import { useAnswerStore } from "./answer-store";
import type { DetailQuestionView } from "@/lib/api/student-attempt";

function question(id: number, key: string | null, sequence = 0): DetailQuestionView {
  return {
    attemptQuestionId: id,
    examQuestionId: id,
    questionType: "SINGLE_CHOICE",
    displayOrder: id,
    content: "Question",
    defaultPoints: 1,
    sectionTitle: null,
    sectionInstructions: null,
    sectionPosition: null,
    options: [],
    savedAnswer: key === null ? null : {
      answerPayload: { selectedOptionKey: key }, sequenceNumber: sequence,
    },
  };
}

beforeEach(() => useAnswerStore.getState().reset());

describe("answer state across server refreshes", () => {
  it("keeps unsaved work and review flags while refreshing clean answers", () => {
    const store = useAnswerStore.getState();
    store.hydrate([question(1, "A", 1), question(2, "A", 1)]);
    store.setAnswer(1, { selectedOptionKey: "B" });
    store.toggleFlag(1);
    store.hydrate([question(1, "A", 1), question(2, "C", 2)]);

    const state = useAnswerStore.getState();
    expect(state.answers[1]).toMatchObject({ payload: { selectedOptionKey: "B" }, sequence: 1, dirty: true });
    expect(state.answers[2]).toMatchObject({ payload: { selectedOptionKey: "C" }, sequence: 2, dirty: false });
    expect(state.flagged[1]).toBe(true);
  });

  it("does not replace an acknowledged newer answer with an older GET", () => {
    const store = useAnswerStore.getState();
    store.hydrate([question(1, "A", 1)]);
    store.setAnswer(1, { selectedOptionKey: "B" });
    store.markSaved(1, 2, { selectedOptionKey: "B" });
    store.hydrate([question(1, "A", 1)]);
    expect(useAnswerStore.getState().answers[1]).toMatchObject({
      payload: { selectedOptionKey: "B" }, sequence: 2, dirty: false,
    });
  });

  it("keeps a stale local answer dirty until the learner chooses a version", () => {
    const store = useAnswerStore.getState();
    store.hydrate([question(1, "A", 1)]);
    store.setAnswer(1, { selectedOptionKey: "X" });
    store.markConflict(1, 2, { selectedOptionKey: "Y" });
    expect(useAnswerStore.getState().answers[1]).toMatchObject({
      payload: { selectedOptionKey: "X" }, dirty: true,
      conflict: { serverPayload: { selectedOptionKey: "Y" }, serverSequence: 2 },
    });
    store.keepLocalAnswer(1);
    expect(useAnswerStore.getState().answers[1]).toMatchObject({
      payload: { selectedOptionKey: "X" }, sequence: 2, dirty: true,
    });
    expect(useAnswerStore.getState().answers[1].conflict).toBeUndefined();
    store.markConflict(1, 3, { selectedOptionKey: "Y" });
    store.useServerAnswer(1);
    expect(useAnswerStore.getState().answers[1]).toMatchObject({
      payload: { selectedOptionKey: "Y" }, sequence: 3, dirty: false,
    });
  });
});
