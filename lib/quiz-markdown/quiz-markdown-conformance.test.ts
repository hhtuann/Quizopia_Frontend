import { describe, expect, it } from "vitest";
import {
  analyzeQuizMarkdown,
  getQuizAutocompleteSuggestions,
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
 * Column semantics intentionally differ from Backend PR #3 in two codes —
 * UNKNOWN_QUESTION_TYPE (TS: 1, Java: computed type column) and
 * NUMERIC_ANSWER_INVALID (TS: 1, Java: computed token column) — matching donor
 * behavior; lines and question numbers agree.
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

  it("reports UNKNOWN_QUESTION_TYPE and NUMERIC_ANSWER_INVALID at column 1 (donor TS semantics; Java computes token columns)", () => {
    expect(
      diagnostic(
        "Câu 1 [single_choice]: stem\nA. a\nB. b\nC. c\nD. d\n",
        "UNKNOWN_QUESTION_TYPE",
      ).column,
    ).toBe(1);
    expect(
      diagnostic("Câu 1 [NUMERIC_FILL]: v?\nĐáp án:   12345\n", "NUMERIC_ANSWER_INVALID")
        .column,
    ).toBe(1);
    expect(
      diagnostic("Câu 1 [NUMERIC_FILL]: v?\nĐáp án:   12345\n", "NUMERIC_ANSWER_INVALID")
        .line,
    ).toBe(2);
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
