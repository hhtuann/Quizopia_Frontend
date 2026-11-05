import { describe, expect, it } from "vitest";
import { analyzeQuizMarkdown } from "./quiz-markdown";
import { bankContractViolations, BANK_NUMERIC_PATTERN } from "./bank-contract";

const SINGLE_CHOICE = `
Câu 1 [SINGLE_CHOICE]: 2 + 2?
*A. 4
B. 3
C. 5
D. 6
`;

const MULTIPLE_TWO = `
Câu 2 [MULTIPLE_CHOICE]: primes?
*A. 2
B. 4
*C. 5
D. 9
`;

const MULTIPLE_ONE = `
Câu 1 [MULTIPLE_CHOICE]: only one star.
*A. one
B. two
C. three
D. four
`;

const TRUE_FALSE = `
Câu 3 [TRUE_FALSE_MATRIX]: judge.
*A. a
B. b
C. c
D. d
`;

const NUMERIC = (number: number, token: string) => `
Câu ${number} [NUMERIC_FILL]: value?
Đáp án: ${token}
`;

describe("bankContractViolations", () => {
  it("passes a fully conformant document (all four types)", () => {
    const analysis = analyzeQuizMarkdown(
      SINGLE_CHOICE + MULTIPLE_TWO + TRUE_FALSE + NUMERIC(4, "2.50")
    );
    expect(analysis.diagnostics).toHaveLength(0);
    expect(bankContractViolations(analysis)).toHaveLength(0);
  });

  it("flags MULTIPLE_CHOICE with exactly one correct option", () => {
    const violations = bankContractViolations(analyzeQuizMarkdown(MULTIPLE_ONE));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("MULTIPLE_CHOICE_MIN_TWO_CORRECT");
    expect(violations[0].questionNumber).toBe(1);
    expect(violations[0].message).toContain("at least 2 correct");
  });

  it("flags the leading-dot numeric token -.50 with the canonical suggestion", () => {
    const violations = bankContractViolations(analyzeQuizMarkdown(NUMERIC(1, "-.50")));
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe("NUMERIC_ANSWER_BANK_CONTRACT");
    expect(violations[0].message).toContain("-0.5");
    expect(violations[0].message).toContain("never rewritten");
  });

  it("accepts canonical four-character numeric tokens", () => {
    for (const token of ["2.50", "-3.5", "02.5", "1234", "-0.5"]) {
      expect(BANK_NUMERIC_PATTERN.test(token)).toBe(true);
      expect(bankContractViolations(analyzeQuizMarkdown(NUMERIC(1, token)))).toHaveLength(0);
    }
  });

  it("reports violations per question across a mixed document", () => {
    const violations = bankContractViolations(
      analyzeQuizMarkdown(MULTIPLE_ONE + NUMERIC(2, "-.50"))
    );
    expect(violations.map((v) => [v.questionNumber, v.code])).toEqual([
      [1, "MULTIPLE_CHOICE_MIN_TWO_CORRECT"],
      [2, "NUMERIC_ANSWER_BANK_CONTRACT"],
    ]);
  });
});
