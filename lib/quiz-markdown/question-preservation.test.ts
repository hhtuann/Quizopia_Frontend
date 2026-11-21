import { describe, expect, it } from "vitest";
import { assessQuestionPreservation } from "./question-preservation";

const Q1 = `Question 1 [SINGLE_CHOICE]: 2 + 2?
*A. 4
B. 3
C. 5
D. 6
`;
const Q2 = `Question 2 [SINGLE_CHOICE]: 3 + 3?
*A. 6
B. 5
C. 7
D. 8
`;
const Q3 = `Question 3 [SINGLE_CHOICE]: 4 + 4?
*A. 8
B. 7
C. 9
D. 10
`;

describe("assessQuestionPreservation", () => {
  it("identical documents are fully preserved", () => {
    const result = assessQuestionPreservation(Q1 + Q2, Q1 + Q2);
    expect(result).toEqual({
      preserved: true,
      lostCount: 0,
      addedCount: 0,
      lostQuestionNumbers: [],
    });
  });

  it("appending questions preserves everything and counts additions", () => {
    const result = assessQuestionPreservation(Q1 + Q2, Q1 + Q2 + Q3);
    expect(result.preserved).toBe(true);
    expect(result.addedCount).toBe(1);
    expect(result.lostQuestionNumbers).toEqual([]);
  });

  it("renumbering after a deletion is detected as a loss (the question is gone)", () => {
    // Before has Q1,Q2; after has only Q1 (renumbered to 1). Q2 is lost.
    const result = assessQuestionPreservation(Q1 + Q2, Q1);
    expect(result.preserved).toBe(false);
    expect(result.lostCount).toBe(1);
    expect(result.lostQuestionNumbers).toEqual([2]);
  });

  it("renumbering WITHOUT deletion preserves (content match, not number match)", () => {
    // Same two questions, but numbered 5 and 9 in the after-document.
    const renumbered =
      Q1.replace("Question 1", "Question 5") +
      Q2.replace("Question 2", "Question 9");
    const result = assessQuestionPreservation(Q1 + Q2, renumbered);
    expect(result.preserved).toBe(true);
    expect(result.lostCount).toBe(0);
  });

  it("a modified stem is a loss even when the question count matches", () => {
    const rewritten = Q1.replace("2 + 2?", "What is 2+2?") + Q2;
    const result = assessQuestionPreservation(Q1 + Q2, rewritten);
    expect(result.preserved).toBe(false);
    expect(result.lostQuestionNumbers).toEqual([1]);
  });

  it("a flipped correct option is a loss", () => {
    const flipped = Q1.replace("*A. 4", "A. 4").replace("B. 3", "*B. 3") + Q2;
    const result = assessQuestionPreservation(Q1 + Q2, flipped);
    expect(result.preserved).toBe(false);
  });

  it("whitespace/case differences in stems do not count as losses", () => {
    const mild = Q1.replace("2 + 2?", "2  +  2?") + Q2;
    const result = assessQuestionPreservation(Q1 + Q2, mild);
    expect(result.preserved).toBe(true);
  });

  it("empty before-document: everything is an addition", () => {
    const result = assessQuestionPreservation("", Q1);
    expect(result.preserved).toBe(true);
    expect(result.addedCount).toBe(1);
  });

  it("empty after-document with non-empty before: everything lost", () => {
    const result = assessQuestionPreservation(Q1 + Q2, "");
    expect(result.preserved).toBe(false);
    expect(result.lostCount).toBe(2);
    expect(result.lostQuestionNumbers).toEqual([1, 2]);
  });

  it("Vietnamese stems are compared correctly", () => {
    const vn = `Câu 1 [SINGLE_CHOICE]: Giao thức nào thuộc tầng Application?
*A. HTTP
B. TCP
C. IP
D. UDP
`;
    const vnEdited = `Câu 1 [SINGLE_CHOICE]: Giao thức nào thuộc tầng Transport?
*A. TCP
B. HTTP
C. IP
D. UDP
`;
    expect(assessQuestionPreservation(vn, vn).preserved).toBe(true);
    expect(assessQuestionPreservation(vn, vnEdited).preserved).toBe(false);
  });
});
