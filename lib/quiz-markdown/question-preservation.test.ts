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

describe("assessQuestionPreservation — re-review round 3", () => {
  it("a question TYPE flip is a loss even when all content is identical", () => {
    const single = `Question 1 [SINGLE_CHOICE]: Pick one?
*A. first
B. second
C. third
D. fourth
`;
    const multiple = `Question 1 [MULTIPLE_CHOICE]: Pick one?
*A. first
B. second
C. third
D. fourth
`;
    const result = assessQuestionPreservation(single, multiple);
    expect(result.preserved).toBe(false);
    expect(result.lostQuestionNumbers).toEqual([1]);
  });

  it("dropping one of two identical duplicate questions is a loss (multiset)", () => {
    const duplicate = Q1 + Q2 + Q1;
    const droppedOne = Q1 + Q2;
    const result = assessQuestionPreservation(duplicate, droppedOne);
    expect(result.preserved).toBe(false);
    expect(result.lostCount).toBe(1);
  });

  it("duplicating an existing question counts as an addition (multiset)", () => {
    const result = assessQuestionPreservation(Q1 + Q2, Q1 + Q2 + Q1);
    expect(result.preserved).toBe(true);
    expect(result.addedCount).toBe(1);
  });
});

describe("assessQuestionPreservation — round 4: unparseable drafts", () => {
  it("REPRO: non-empty draft with an incomplete question header is NOT preserved by a full replacement", () => {
    // The teacher typed a question header but no stem/colon yet.
    const draft = "Question 1 [SINGLE_CHOICE]";
    const replacement = `Question 1 [SINGLE_CHOICE]: done?
*A. x
B. y
C. z
D. w
`;
    const result = assessQuestionPreservation(draft, replacement);
    // SAFE expectation: the draft text cannot be proven preserved.
    expect(result.preserved).toBe(false);
  });

  it("REPRO: plain non-Quiz-Markdown notes are NOT preserved by a full replacement", () => {
    const notes = "lesson notes: cover TCP handshake and window scaling";
    const replacement = `Question 1 [SINGLE_CHOICE]: topic?
*A. x
B. y
C. z
D. w
`;
    const result = assessQuestionPreservation(notes, replacement);
    expect(result.preserved).toBe(false);
  });

  it("whitespace-only before-source IS preserved (equivalent to empty)", () => {
    const result = assessQuestionPreservation("   \n  \n", Q1);
    expect(result.preserved).toBe(true);
    expect(result.addedCount).toBe(1);
  });

  it("empty before-source IS preserved (fresh document)", () => {
    const result = assessQuestionPreservation("", Q1);
    expect(result.preserved).toBe(true);
  });

  it("valid existing questions still preserve on additive change", () => {
    const result = assessQuestionPreservation(Q1 + Q2, Q1 + Q2 + Q3);
    expect(result.preserved).toBe(true);
  });

  it("valid questions PLUS unparsed trailing notes: dropping the notes is a loss", () => {
    const withNotes = Q1 + "\nremember to cover window scaling next time\n";
    const result = assessQuestionPreservation(withNotes, Q1);
    // The questions survive but the unparsed note is gone — fail closed.
    expect(result.preserved).toBe(false);
  });
});

describe("assessQuestionPreservation — round 5: parser-visibility gaps", () => {
  it("a leading free-text note before the first question is protected", () => {
    const withLeadingNote = "lesson notes: cover TCP handshake\n" + Q1;
    const result = assessQuestionPreservation(withLeadingNote, Q1);
    expect(result.preserved).toBe(false);
  });

  it("an incomplete question header AFTER a complete question is protected", () => {
    const withIncomplete = Q1 + "Question 2 [SINGLE_CHOICE]";
    const result = assessQuestionPreservation(withIncomplete, Q1);
    expect(result.preserved).toBe(false);
  });

  it("a leading note document still allows explicit replacement semantics (not preserved, but assessable)", () => {
    const withLeadingNote = "notes\n" + Q1 + Q2;
    const result = assessQuestionPreservation(withLeadingNote, Q1 + Q2 + Q3);
    // The note cannot be verified — fail closed even though questions match.
    expect(result.preserved).toBe(false);
  });

  it("a blank line before the first question does NOT block preservation", () => {
    const withBlank = "\n\n" + Q1 + Q2;
    const result = assessQuestionPreservation(withBlank, Q1 + Q2 + Q3);
    expect(result.preserved).toBe(true);
  });
});
