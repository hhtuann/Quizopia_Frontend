// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAttemptDetail, saveAnswer } from "@/lib/api/student-attempt";
import type { AttemptDetailResponse, DetailQuestionView } from "@/lib/api/student-attempt";
import { useAnswerStore } from "./answer-store";
import { useAutosaveAnswers } from "./use-autosave";

vi.mock("@/lib/api/student-attempt", () => ({
  saveAnswer: vi.fn(),
  getAttemptDetail: vi.fn(),
}));

const saveMock = vi.mocked(saveAnswer);
const detailMock = vi.mocked(getAttemptDetail);

function question(key: string, sequence: number, id = 7): DetailQuestionView {
  return {
    attemptQuestionId: id, examQuestionId: id * 10, questionType: "SINGLE_CHOICE",
    displayOrder: 0, content: "Question", defaultPoints: 1,
    sectionTitle: null, sectionInstructions: null, sectionPosition: null,
    options: [], savedAnswer: { answerPayload: { selectedOptionKey: key }, sequenceNumber: sequence },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset();
  detailMock.mockReset();
  useAnswerStore.getState().reset();
  useAnswerStore.getState().hydrate([question("A", 1)]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("autosave acknowledgements", () => {
  it("does not claim a stale answer was saved when another tab has a different version", async () => {
    saveMock.mockResolvedValue({ accepted: false, reason: "STALE_SEQUENCE",
      attemptQuestionId: 7, currentSequenceNumber: 2, savedAt: "2026-01-01T00:00:00Z",
      serverTime: "2026-01-01T00:00:00Z" });
    detailMock.mockResolvedValue({ questions: [question("Y", 2)] } as AttemptDetailResponse);
    const hook = renderHook(() => useAutosaveAnswers(3));
    act(() => useAnswerStore.getState().setAnswer(7, { selectedOptionKey: "X" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(hook.result.current.status).toBe("conflict");
    expect(useAnswerStore.getState().answers[7]).toMatchObject({
      payload: { selectedOptionKey: "X" }, dirty: true,
      conflict: { serverPayload: { selectedOptionKey: "Y" }, serverSequence: 2 },
    });
  });

  it("lets the learner retry an answer after a network failure", async () => {
    saveMock.mockRejectedValueOnce({ kind: "network", message: "offline" });
    saveMock.mockResolvedValueOnce({ accepted: true, attemptQuestionId: 7,
      currentSequenceNumber: 2, savedAt: "2026-01-01T00:00:00Z",
      serverTime: "2026-01-01T00:00:00Z" });
    const hook = renderHook(() => useAutosaveAnswers(3));
    act(() => useAnswerStore.getState().setAnswer(7, { selectedOptionKey: "X" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.retryable).toBe(true);
    await act(async () => { hook.result.current.retryNow(); await Promise.resolve(); });
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(useAnswerStore.getState().answers[7]).toMatchObject({ dirty: false, sequence: 2 });
  });

  it("keeps retry available for one failed answer while another answer conflicts", async () => {
    useAnswerStore.getState().hydrate([question("A", 1), question("A", 1, 8)]);
    saveMock.mockImplementation(async (_attemptId, request) => {
      if (request.attemptQuestionId === 7) {
        if (saveMock.mock.calls.filter(([, req]) => req.attemptQuestionId === 7).length === 1) {
          throw { kind: "network", message: "offline" };
        }
        return { accepted: true, attemptQuestionId: 7, currentSequenceNumber: 2,
          savedAt: "2026-01-01T00:00:00Z", serverTime: "2026-01-01T00:00:00Z" };
      }
      return { accepted: false, reason: "STALE_SEQUENCE", attemptQuestionId: 8,
        currentSequenceNumber: 2, savedAt: "2026-01-01T00:00:00Z",
        serverTime: "2026-01-01T00:00:00Z" };
    });
    detailMock.mockResolvedValue({ questions: [question("A", 1), question("Y", 2, 8)] } as AttemptDetailResponse);
    const hook = renderHook(() => useAutosaveAnswers(3));
    act(() => {
      useAnswerStore.getState().setAnswer(7, { selectedOptionKey: "X" });
      useAnswerStore.getState().setAnswer(8, { selectedOptionKey: "X" });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(hook.result.current.retryable).toBe(true);
    expect(useAnswerStore.getState().answers[8].conflict).toBeDefined();
    await act(async () => { hook.result.current.retryNow(); await Promise.resolve(); });
    expect(saveMock.mock.calls.map(([, req]) => req.attemptQuestionId)).toEqual([7, 8, 7]);
    expect(useAnswerStore.getState().answers[7].dirty).toBe(false);
  });
});
