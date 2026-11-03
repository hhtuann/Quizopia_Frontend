import { describe, expect, it } from "vitest";
import {
  analyzeQuizMarkdown,
  getQuizAutocompleteSuggestions,
  isValidNumericAnswerToken,
  toggleQuizOptionCorrectness,
} from "./quiz-markdown";
import {
  clampSourceOffset,
  preferredQuizMarkdownLineEnding,
  preserveQuizMarkdownTextareaEdit,
  sourceLineBoundsAtOffset,
  sourceOffsetFromTextareaOffset,
} from "./quiz-markdown-coordinates";

/**
 * Extensions beyond the ported donor suites (P2-M1-B):
 * - full diagnostics table with question/line/column semantics
 * - one canonical cross-language conformance fixture (CRLF + fence + display math)
 * - engine edge cases (tab suppression, Vietnamese case folding, lone-CR, clamps,
 *   toggle guards, Unicode preservation)
 *
 * Diagnostic columns follow Backend PR #3 exactly: UNKNOWN_QUESTION_TYPE and
 * NUMERIC_ANSWER_INVALID report the computed token columns (typeColumn /
 * answerColumn parity), numbering diagnostics stay at column 5.
 */

function diagnostic(source: string, code: string) {
  const match = analyzeQuizMarkdown(source).diagnostics.find(
    (item) => item.code === code,
  );
  expect(match, `missing ${code} in ${JSON.stringify(analyzeQuizMarkdown(source).diagnostics)}`).toBeDefined();
  return match!;
}

function singleChoice(options: string) {
  return `Câu 1 [SINGLE_CHOICE]: stem\n${options}\n`;
}

describe("Quiz Markdown diagnostics coverage", () => {
  it.each([
    // [source, code, questionNumber, line]
    ["", "NO_QUESTIONS", null, 1],
    ["plain text", "CONTENT_OUTSIDE_QUESTION", null, 1],
    ["A. orphan\n", "OPTION_OUTSIDE_QUESTION", null, 1],
    ["Đáp án: 1234\n", "ANSWER_OUTSIDE_QUESTION", null, 1],
    ["Lời giải: orphan\n", "EXPLANATION_OUTSIDE_QUESTION", null, 1],
    [
      "Câu 0 [NUMERIC_FILL]: v?\nĐáp án: 1234\n",
      "QUESTION_NUMBER_MUST_START_AT_ONE",
      0,
      1,
    ],
    [
      "Câu 2 [NUMERIC_FILL]: two\nĐáp án: 1234\nCâu 1 [NUMERIC_FILL]: one\nĐáp án: 1234\n",
      "QUESTION_NUMBER_NOT_CONTINUOUS",
      1,
      3,
    ],
    [
      "Câu 1 [NUMERIC_FILL]: one\nĐáp án: 1234\nCâu 3 [NUMERIC_FILL]: three\nĐáp án: 1234\n",
      "QUESTION_NUMBER_GAP",
      3,
      3,
    ],
    [
      "Câu 1 [NUMERIC_FILL]: one\nĐáp án: 1234\nCâu 1 [NUMERIC_FILL]: again\nĐáp án: 1234\n",
      "DUPLICATE_QUESTION_NUMBER",
      1,
      3,
    ],
    [
      "Câu 1 [single_choice]: stem\nA. a\nB. b\nC. c\nD. d\n",
      "UNKNOWN_QUESTION_TYPE",
      1,
      1,
    ],
    ["Câu 1 [SINGLE_CHOICE]:\n*A. a\nB. b\nC. c\nD. d\n", "EMPTY_STEM", 1, 1],
    [
      singleChoice("*A. a\nC. c\nD. d\nD. dup"),
      "MISSING_OPTION",
      1,
      3,
    ],
    [
      singleChoice("*A. a\nB. b\nB. dup\nD. d"),
      "DUPLICATE_OPTION",
      1,
      4,
    ],
    [singleChoice("*A. a\nB.\nC. c\nD. d"), "EMPTY_OPTION", 1, 3],
    [
      singleChoice("*A. a\nB. b\nC. c\nD. d\nA. again"),
      "TOO_MANY_OPTIONS",
      1,
      6,
    ],
    [
      singleChoice("A. a\nB. b\nC. c\nD. d"),
      "SINGLE_CHOICE_CORRECT_COUNT",
      1,
      1,
    ],
    [
      "Câu 1 [MULTIPLE_CHOICE]: stem\nA. a\nB. b\nC. c\nD. d\n",
      "MULTIPLE_CHOICE_CORRECT_REQUIRED",
      1,
      1,
    ],
    [
      "Câu 1 [NUMERIC_FILL]: stem\nA. invalid\nĐáp án: 1234\n",
      "UNEXPECTED_OPTION",
      1,
      2,
    ],
    [
      singleChoice("*A. a\nB. b\nC. c\nD. d") + "Đáp án: 1234\n",
      "UNEXPECTED_NUMERIC_ANSWER",
      1,
      6,
    ],
    [
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án: 1234\nĐáp án: 5678\n",
      "DUPLICATE_NUMERIC_ANSWER",
      1,
      3,
    ],
    [
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án: 1234\nstray text\n",
      "CONTENT_AFTER_NUMERIC_ANSWER",
      1,
      3,
    ],
    [
      singleChoice("*A. a\nB. b\nC. c\nD. d") + "Lời giải: exp\nA. late\n",
      "OPTION_AFTER_EXPLANATION",
      1,
      7,
    ],
    [
      "Câu 1 [NUMERIC_FILL]: v?\nLời giải: exp\nĐáp án: 1234\n",
      "ANSWER_AFTER_EXPLANATION",
      1,
      3,
    ],
    [
      "Câu 1 [SINGLE_CHOICE]: stem\nLời giải: early\n*A. a\nB. b\nC. c\nD. d\n",
      "EXPLANATION_BEFORE_ANSWER_STRUCTURE",
      1,
      2,
    ],
    [
      singleChoice("*A. a\nB. b\nC. c\nD. d") + "Lời giải: one\nLời giải: two\n",
      "DUPLICATE_EXPLANATION",
      1,
      7,
    ],
  ])("reports %s at question %p line %p", (source, code, questionNumber, line) => {
    const match = diagnostic(source as string, code as string);
    expect(match.questionNumber).toBe(questionNumber);
    expect(match.line).toBe(line);
    expect(match.column).toBeGreaterThan(0);
    expect(match.message.length).toBeGreaterThan(0);
  });

  it("keeps numbering diagnostics at column 5, matching Backend PR #3", () => {
    expect(
      diagnostic(
        "Câu 2 [NUMERIC_FILL]: two\nĐáp án: 1234\n",
        "QUESTION_NUMBER_MUST_START_AT_ONE",
      ).column,
    ).toBe(5);
  });

  it("reports UNKNOWN_QUESTION_TYPE and NUMERIC_ANSWER_INVALID at exact Java token columns (Backend PR #3 parity)", () => {
    const unknown = diagnostic(
      "Câu 1 [small_choice]: stem\nA. a\nB. b\nC. c\nD. d\n",
      "UNKNOWN_QUESTION_TYPE",
    );
    expect(unknown).toMatchObject({ questionNumber: 1, line: 1, column: 8 });

    // Multi-digit question numbers shift the [TYPE] token accordingly.
    const wide = diagnostic(
      "Câu 12 [SINGLE_CHOICE]: stem\n*A. a\nB. b\nC. c\nD. d\nCâu 345 [bogus]: x\n",
      "UNKNOWN_QUESTION_TYPE",
    );
    expect(wide).toMatchObject({ questionNumber: 345, line: 6, column: 10 });

    const invalid = diagnostic(
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án:   12345\n",
      "NUMERIC_ANSWER_INVALID",
    );
    // "Đáp án:" (7) + 3 spaces + 1 → token starts at column 11.
    expect(invalid).toMatchObject({ questionNumber: 1, line: 2, column: 11 });

    // Tab whitespace after the marker counts one column, like Java.
    const tabbed = diagnostic(
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án:\t12345\n",
      "NUMERIC_ANSWER_INVALID",
    );
    expect(tabbed).toMatchObject({ questionNumber: 1, line: 2, column: 9 });

    // Non-breaking space is NOT Java whitespace: column stays at 8.
    const nbsp = diagnostic(
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án:\u00A012345\n",
      "NUMERIC_ANSWER_INVALID",
    );
    expect(nbsp).toMatchObject({ questionNumber: 1, line: 2, column: 8 });
  });

  it("still exposes partially valid questions for live preview alongside diagnostics", () => {
    const result = analyzeQuizMarkdown(
      "Câu 1 [SINGLE_CHOICE]: good\n*A. a\nB. b\nC. c\nD. d\nCâu 3 [SINGLE_CHOICE]: gap\n*A. a\nB. b\nC. c\nD. d\n",
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[1]?.stem).toBe("gap");
    expect(
      result.diagnostics.map((item) => item.code),
    ).toContain("QUESTION_NUMBER_GAP");
  });
});

describe("Quiz Markdown cross-language conformance fixture", () => {
  const source = [
    "Câu 1 [SINGLE_CHOICE]: Chọn giao thức tầng Application.",
    "```text",
    "Câu 99 [MULTIPLE_CHOICE]: fake",
    "```",
    "*A. HTTP",
    "B. FTP",
    "C. TCP",
    "D. UDP",
    "Câu 2 [NUMERIC_FILL]: Giá trị của 10 / 4 (hai chữ số thập phân)?",
    "$$",
    "x = 10 / 4",
    "$$",
    "Đáp án: 2.50",
    "Lời giải: `10 / 4 = 2.5`",
  ].join("\r\n");

  it("produces zero diagnostics and the full expected structure", () => {
    const result = analyzeQuizMarkdown(source);
    expect(result.diagnostics).toEqual([]);

    expect(result.questions).toHaveLength(2);

    const first = result.questions[0]!;
    expect(first).toMatchObject({
      number: 1,
      type: "SINGLE_CHOICE",
      stem: "Chọn giao thức tầng Application.\n```text\nCâu 99 [MULTIPLE_CHOICE]: fake\n```",
      numericAnswer: null,
      explanation: null,
    });
    expect(first.options.map((option) => option.label)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(first.options.map((option) => option.correct)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(first.options[0]?.content).toBe("HTTP");
    expect(first.source).toEqual({ line: 1, offset: 0 });
    expect(first.options[0]?.source).toEqual({
      line: 5,
      markerOffset: source.indexOf("A. HTTP"),
      starOffset: source.indexOf("*A. HTTP"),
    });

    const second = result.questions[1]!;
    expect(second).toMatchObject({
      number: 2,
      type: "NUMERIC_FILL",
      stem: "Giá trị của 10 / 4 (hai chữ số thập phân)?\n$$\nx = 10 / 4\n$$",
      numericAnswer: "2.50",
      explanation: "`10 / 4 = 2.5`",
    });
    expect(second.options).toEqual([]);
    expect(second.source).toEqual({
      line: 9,
      offset: source.indexOf("Câu 2"),
    });
  });

  it("toggles the single correct marker on the fixture without touching anything else", () => {
    const question = analyzeQuizMarkdown(source).questions[0]!;
    const next = toggleQuizOptionCorrectness(
      source,
      question,
      question.options[1]!,
    );
    expect(next).toBe(source.replace("*A. HTTP", "A. HTTP").replace("B. FTP", "*B. FTP"));
  });
});

describe("Quiz Markdown engine edge cases", () => {
  it("suppresses structural autocomplete for tab-indented structural lookalikes", () => {
    expect(getQuizAutocompleteSuggestions("\tCâu", 4)).toEqual([]);
    const tabbedOption = "Câu 1 [SINGLE_CHOICE]: x\n\t*A.";
    expect(
      getQuizAutocompleteSuggestions(tabbedOption, tabbedOption.length),
    ).toEqual([]);
  });

  it("folds Vietnamese uppercase prefixes for question and answer markers", () => {
    expect(
      getQuizAutocompleteSuggestions("CÂU 5 [S", 8).map((item) => item.label),
    ).toEqual(["Câu 5 [SINGLE_CHOICE]:"]);
    const numeric = "Câu 1 [NUMERIC_FILL]: v?\nĐÁP";
    expect(
      getQuizAutocompleteSuggestions(numeric, numeric.length)[0]?.insertText,
    ).toBe("Đáp án: ");
  });

  it("returns source untouched when toggling a NUMERIC_FILL question or an already-correct SINGLE_CHOICE option", () => {
    const numericSource = "Câu 1 [NUMERIC_FILL]: v?\nĐáp án: 1234\n";
    const numericQuestion = analyzeQuizMarkdown(numericSource).questions[0]!;
    const fabricatedOption = {
      content: "",
      correct: false,
      label: "A" as const,
      source: { line: 0, markerOffset: 0, starOffset: null },
    };
    expect(
      toggleQuizOptionCorrectness(numericSource, numericQuestion, fabricatedOption),
    ).toBe(numericSource);

    const singleSource = "Câu 1 [SINGLE_CHOICE]: s\n*A. a\nB. b\nC. c\nD. d\n";
    const singleQuestion = analyzeQuizMarkdown(singleSource).questions[0]!;
    expect(
      toggleQuizOptionCorrectness(singleSource, singleQuestion, singleQuestion.options[0]!),
    ).toBe(singleSource);
  });

  it("preserves Unicode content exactly through analysis", () => {
    const stem = "🌟 Tính: ½ × ４ ≠ 2 — emoji & décor";
    const result = analyzeQuizMarkdown(
      `Câu 1 [SINGLE_CHOICE]: ${stem}\n*A. a\nB. b\nC. c\nD. d\n`,
    );
    expect(result.questions[0]?.stem).toBe(stem);
    expect(result.diagnostics).toEqual([]);
  });

  it("handles lone-CR sources end to end", () => {
    expect(preferredQuizMarkdownLineEnding("a\rb\rc")).toBe("\r");
    expect(analyzeQuizMarkdown("Câu 1 [NUMERIC_FILL]: v?\rĐáp án: 1234\r").questions[0]?.numericAnswer).toBe(
      "1234",
    );
    expect(preserveQuizMarkdownTextareaEdit("a\rb", "a\nb\nc")).toBe("a\rb\rc");
    expect(sourceLineBoundsAtOffset("a\rb", 2)).toEqual({
      start: 2,
      contentEnd: 3,
      end: 3,
    });
  });

  it("clamps offsets defensively", () => {
    expect(clampSourceOffset("abc", -5)).toBe(0);
    expect(clampSourceOffset("abc", 99)).toBe(3);
    expect(sourceOffsetFromTextareaOffset("abc", 99)).toBe(3);
    expect(sourceLineBoundsAtOffset("", 0)).toEqual({
      start: 0,
      contentEnd: 0,
      end: 0,
    });
  });
});

describe("Quiz Markdown remediation parity (TL review of PR #2)", () => {
  it("rejects question numbers above Integer.MAX_VALUE with the Java diagnostic", () => {
    const overflow = analyzeQuizMarkdown(
      "Câu 2147483648 [SINGLE_CHOICE]: x\n*A. a\n",
    );
    expect(overflow.questions).toHaveLength(0);
    expect(overflow.diagnostics[0]).toMatchObject({
      code: "MALFORMED_QUESTION_HEADER",
      questionNumber: null,
      line: 1,
      column: 5,
      message: "Question number is outside the supported integer range",
    });
    expect(
      overflow.diagnostics
        .filter((item) => item.code === "MALFORMED_QUESTION_HEADER")
        .map((item) => item.message),
    ).toEqual(["Question number is outside the supported integer range"]);

    // Unsafe-int territory (20 nines) is rejected the same way.
    const unsafe = analyzeQuizMarkdown("Câu 99999999999999999999 [NUMERIC_FILL]: x\n");
    expect(unsafe.questions).toHaveLength(0);
    expect(
      unsafe.diagnostics.some(
        (item) =>
          item.code === "MALFORMED_QUESTION_HEADER" &&
          item.questionNumber === null &&
          item.line === 1 &&
          item.column === 5,
      ),
    ).toBe(true);
  });

  it("still accepts Integer.MAX_VALUE itself and applies normal numbering rules", () => {
    const boundary = analyzeQuizMarkdown(
      "Câu 2147483647 [NUMERIC_FILL]: v?\nĐáp án: 1234\n",
    );
    expect(boundary.questions).toHaveLength(1);
    expect(boundary.questions[0]?.number).toBe(2147483647);
    expect(
      boundary.diagnostics.map((item) => item.code),
    ).toEqual(["QUESTION_NUMBER_MUST_START_AT_ONE"]);
  });

  it("preserves expected-numbering autocomplete after an overflow header", () => {
    const source =
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án: 1234\nCâu 99999999999999999999 [SINGLE_CHOICE]: x\nC";
    expect(
      getQuizAutocompleteSuggestions(source, source.length).map(
        (item) => item.label,
      ),
    ).toEqual([
      "Câu 3 [SINGLE_CHOICE]:",
      "Câu 3 [MULTIPLE_CHOICE]:",
      "Câu 3 [TRUE_FALSE_MATRIX]:",
      "Câu 3 [NUMERIC_FILL]:",
    ]);
  });

  it("normalizes numeric tokens with Java Character.isWhitespace semantics, not String.trim", () => {
    // Java String.strip() keeps non-breaking whitespace: these become invalid
    // (length ≠ 4 after strip, or illegal characters).
    expect(isValidNumericAnswerToken("\u00A01234\u00A0")).toBe(false);
    expect(isValidNumericAnswerToken("\uFEFF2.50")).toBe(false);
    expect(isValidNumericAnswerToken("\u2007-0.5\u2007")).toBe(false);
    expect(isValidNumericAnswerToken("\u202F1234")).toBe(false);

    // Java-only separators U+001C–U+001F are stripped by Java and by us.
    expect(isValidNumericAnswerToken("\u001C1234\u001D")).toBe(true);

    // Whitespace both languages strip, plus plain ASCII: unchanged behavior.
    expect(isValidNumericAnswerToken("\u20051234\u2005")).toBe(true);
    expect(isValidNumericAnswerToken("  -3.5\t")).toBe(true);
    expect(isValidNumericAnswerToken("1\u00A02")).toBe(false);
  });

  it("applies the Java strip to the emitted numericAnswer value end to end", () => {
    const valid = analyzeQuizMarkdown("Câu 1 [NUMERIC_FILL]: v?\nĐáp án: \t-3.5  \n");
    expect(valid.questions[0]?.numericAnswer).toBe("-3.5");

    const nbsp = analyzeQuizMarkdown(
      "Câu 1 [NUMERIC_FILL]: v?\nĐáp án:\u00A01234\n",
    );
    expect(
      nbsp.diagnostics.some((item) => item.code === "NUMERIC_ANSWER_INVALID"),
    ).toBe(true);
    expect(nbsp.questions[0]?.numericAnswer).toBe("\u00A01234");
  });
});
