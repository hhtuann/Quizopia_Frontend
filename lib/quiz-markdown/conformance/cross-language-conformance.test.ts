import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeQuizMarkdown } from "../quiz-markdown";

/**
 * Cross-language conformance harness (P2-M1-D, Quizopia_System issue #9).
 *
 * Executes the real `analyzeQuizMarkdown` against the canonical fixture file
 * shared byte-identically with the backend repository
 * (hhtuann/Quizopia_Backend: src/test/resources/markdown/). The SHA-256
 * constant asserts this copy is the canonical one; the same constant lives in
 * the backend harness so any divergence fails loudly in either repo.
 *
 * Comparison policy (documented in the fixture file):
 * - Valid cases: full normalized question structure.
 * - Invalid cases: diagnostics compared as an unordered SET of
 *   code|questionNumber|line|column tuples (identical duplicate tuples
 *   collapse; intentional Java/TS emission-order differences are ignored).
 * - TS partial-preview output for invalid sources is intentional and NOT
 *   compared: Java is all-or-nothing, TypeScript keeps partially parsed
 *   questions for the live editor preview. Only validity and the diagnostic
 *   set are authoritative.
 */

const FIXTURE_PATH = new URL(
  "./quiz-markdown-conformance-fixtures.json",
  import.meta.url,
);
const CANONICAL_FIXTURE_SHA256 =
  "3baa1a74674b7b4b2448d6910bafd299eaa1710b60c7f0d90a2c183b8be7be03";

interface FixtureOption {
  readonly content: string;
  readonly correct: boolean;
  readonly label: string;
}

interface FixtureQuestion {
  readonly explanation: string | null;
  readonly number: number;
  readonly numericAnswer: string | null;
  readonly options: readonly FixtureOption[];
  readonly stem: string;
  readonly type: string;
}

interface FixtureDiagnostic {
  readonly code: string;
  readonly column: number;
  readonly line: number;
  readonly questionNumber: number | null;
}

interface FixtureCase {
  readonly diagnostics?: readonly FixtureDiagnostic[];
  readonly id: string;
  readonly questions?: readonly FixtureQuestion[];
  readonly source: string;
  readonly valid: boolean;
}

interface Fixtures {
  readonly cases: readonly FixtureCase[];
  readonly version: number;
}

function diagnosticKey(diagnostic: FixtureDiagnostic): string {
  return `${diagnostic.code}|${diagnostic.questionNumber}|${diagnostic.line}|${diagnostic.column}`;
}

function loadFixtures(): Fixtures {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as Fixtures;
}

describe("cross-language conformance fixtures", () => {
  it("is the canonical byte-identical copy shared with the backend repository", () => {
    const bytes = readFileSync(FIXTURE_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(digest).toBe(CANONICAL_FIXTURE_SHA256);
  });

  it("conforms to the real analyzeQuizMarkdown for every canonical case", () => {
    const fixtures = loadFixtures();
    expect(fixtures.version).toBe(1);
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(30);

    for (const fixtureCase of fixtures.cases) {
      const analysis = analyzeQuizMarkdown(fixtureCase.source);

      expect(analysis.diagnostics.length === 0, `${fixtureCase.id}: validity`).toBe(
        fixtureCase.valid,
      );

      if (fixtureCase.valid) {
        expect(
          analysis.questions.length,
          `${fixtureCase.id}: question count`,
        ).toBe(fixtureCase.questions?.length ?? 0);
        analysis.questions.forEach((question, index) => {
          const expected = fixtureCase.questions?.[index];
          expect(expected, `${fixtureCase.id}: unexpected question ${index}`).toBeDefined();
          expect(question.number, `${fixtureCase.id}[${index}]: number`).toBe(expected!.number);
          expect(question.type, `${fixtureCase.id}[${index}]: type`).toBe(expected!.type);
          expect(question.stem, `${fixtureCase.id}[${index}]: stem`).toBe(expected!.stem);
          expect(question.numericAnswer, `${fixtureCase.id}[${index}]: numericAnswer`).toBe(
            expected!.numericAnswer,
          );
          expect(question.explanation, `${fixtureCase.id}[${index}]: explanation`).toBe(
            expected!.explanation,
          );
          expect(question.options.length, `${fixtureCase.id}[${index}]: option count`).toBe(
            expected!.options.length,
          );
          question.options.forEach((option, optionIndex) => {
            const expectedOption = expected!.options[optionIndex]!;
            expect(option.label, `${fixtureCase.id}[${index}]: option label`).toBe(
              expectedOption.label,
            );
            expect(option.correct, `${fixtureCase.id}[${index}]: option correct`).toBe(
              expectedOption.correct,
            );
            expect(option.content, `${fixtureCase.id}[${index}]: option content`).toBe(
              expectedOption.content,
            );
          });
        });
      } else {
        // Authoritative comparison: validity + diagnostic set only. Partial
        // preview questions are a documented TypeScript-only extension.
        const expected = (fixtureCase.diagnostics ?? [])
          .map(diagnosticKey)
          .sort()
          .filter((value, index, list) => list.indexOf(value) === index);
        const actual = analysis.diagnostics
          .map(diagnosticKey)
          .sort()
          .filter((value, index, list) => list.indexOf(value) === index);
        expect(actual, `${fixtureCase.id}: diagnostics set`).toEqual(expected);
      }
    }
  });

  it("keeps TypeScript-only preview metadata out of the authoritative comparison", () => {
    // Documented intentional difference: invalid sources still expose partial
    // questions (with source offsets) for the live preview; Java exposes none.
    const analysis = analyzeQuizMarkdown(
      "Câu 1 [SINGLE_CHOICE]: good\n*A. a\nB. b\nC. c\nD. d\nCâu 3 [SINGLE_CHOICE]: gap\n*A. a\nB. b\nC. c\nD. d\n",
    );
    expect(analysis.questions.length).toBe(2);
    expect(analysis.questions[1]?.source.offset).toBeGreaterThan(0);
    expect(analysis.diagnostics.length).toBeGreaterThan(0);
  });
});
