"use client";

import { useId } from "react";
import {
  analyzeQuizMarkdown,
  toggleQuizOptionCorrectness,
  type QuizPreviewOption,
  type QuizPreviewQuestion,
} from "@/lib/quiz-markdown";
import { MarkdownContent } from "./markdown-content";

/**
 * Authoring-only live preview of Quiz Markdown questions. Interaction model
 * (option toggles that edit only the structural `*`, question/diagnostic
 * navigation, authoring-visible answers) is ported from the Quizopia 2.0
 * donor `quiz-preview.tsx` (develop @ b8131fbb); the visual layer follows
 * Quizopia System's QuestionCard / QuestionAnswerView language.
 *
 * This component is teacher-authoring only: it shows correct answers and
 * explanations and must never back student-facing delivery.
 */

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE_MATRIX: "True / False",
  NUMERIC_FILL: "Numeric fill",
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[#10B981]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </svg>
  );
}

function correctPill(label: string) {
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#10B981]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#10B981]">
      <CheckIcon /> {label}
    </span>
  );
}

function trueFalsePill(value: boolean) {
  return value ? (
    <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-[#10B981]/30 bg-[#10B981]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#10B981]">
      True
    </span>
  ) : (
    <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-[#EF4444]/30 bg-[#EF4444]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#EF4444]">
      False
    </span>
  );
}

function PreviewQuestion({
  onOptionToggle,
  onQuestionSelect,
  question,
  readOnly,
}: {
  readonly onOptionToggle?: (
    question: QuizPreviewQuestion,
    option: QuizPreviewOption,
  ) => void;
  readonly onQuestionSelect?: (question: QuizPreviewQuestion) => void;
  readonly question: QuizPreviewQuestion;
  readonly readOnly: boolean;
}) {
  const canSelectQuestion = !readOnly && onQuestionSelect !== undefined;
  const canToggle = !readOnly && onOptionToggle !== undefined;
  const isMatrix = question.type === "TRUE_FALSE_MATRIX";

  return (
    <article
      className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_4px_6px_rgba(0,0,0,0.07)] sm:p-5"
      data-source-line={question.source.line}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold tracking-[-0.01em] text-[#0F172A]">
          {canSelectQuestion ? (
            <button
              aria-label={`Jump to source for question ${question.number}, line ${question.source.line}`}
              className="rounded-md text-left text-sm font-semibold text-[#0F172A] transition-colors hover:text-[#0052FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 motion-reduce:transition-none"
              onClick={() => onQuestionSelect(question)}
              type="button"
            >
              Câu {question.number}
            </button>
          ) : (
            `Câu ${question.number}`
          )}
        </h3>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
          {TYPE_LABEL[question.type] ?? question.type}
        </span>
      </div>
      <div className="mt-1.5 text-sm leading-relaxed text-[#0F172A]">
        <MarkdownContent value={question.stem} />
      </div>
      {question.options.length > 0 ? (
        <ul
          aria-label={`Options for question ${question.number}`}
          className="mt-3 space-y-1.5"
        >
          {question.options.map((option) => (
            <li key={`${question.number}-${option.label}`}>
              {canToggle ? (
                <button
                  aria-label={`${option.label}. ${
                    option.correct ? "Marked correct" : "Not marked correct"
                  }`}
                  aria-pressed={option.correct}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 motion-reduce:transition-none ${
                    option.correct
                      ? "border-[#10B981]/50 bg-[#10B981]/10 hover:bg-[#10B981]/15"
                      : "border-[#E2E8F0] bg-[#F1F5F9] hover:border-[#0052FF]/30 hover:bg-[#0052FF]/5"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOptionToggle(question, option);
                  }}
                  type="button"
                >
                  <span className="font-mono font-semibold text-[#64748B]">
                    {option.label}.
                  </span>
                  <span className="min-w-0 flex-1 text-[#0F172A]">
                    <MarkdownContent value={option.content} />
                  </span>
                  {isMatrix
                    ? trueFalsePill(option.correct)
                    : option.correct
                      ? correctPill("correct")
                      : null}
                </button>
              ) : (
                <div
                  aria-label={`${option.label}. ${
                    option.correct ? "Marked correct" : "Not marked correct"
                  }`}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                    option.correct
                      ? "border-[#10B981]/50 bg-[#10B981]/10"
                      : "border-[#E2E8F0] bg-[#F1F5F9]"
                  }`}
                  role="group"
                >
                  <span className="font-mono font-semibold text-[#64748B]">
                    {option.label}.
                  </span>
                  <span className="min-w-0 flex-1 text-[#0F172A]">
                    <MarkdownContent value={option.content} />
                  </span>
                  {isMatrix
                    ? trueFalsePill(option.correct)
                    : option.correct
                      ? correctPill("correct")
                      : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {question.numericAnswer !== null ? (
        <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2 text-xs">
          <span className="font-mono font-semibold uppercase tracking-wide text-[#64748B]">
            Đáp án / Expected answer
          </span>{" "}
          <code className="font-mono font-bold text-[#0052FF]">
            {question.numericAnswer}
          </code>
        </div>
      ) : null}
      {question.explanation !== null ? (
        <div className="mt-3 border-t border-[#E2E8F0] pt-3">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
            Lời giải
          </p>
          <div className="text-sm leading-relaxed text-[#64748B]">
            <MarkdownContent value={question.explanation} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DiagnosticItem({
  diagnostic,
  onSelect,
}: {
  readonly diagnostic: {
    readonly code: string;
    readonly column: number;
    readonly line: number;
    readonly message: string;
  };
  readonly onSelect?: (line: number, column: number) => void;
}) {
  const body = (
    <>
      <span className="font-mono text-xs font-semibold text-[#EF4444]">
        {diagnostic.code}
      </span>{" "}
      <span className="font-mono text-[10px] uppercase tracking-wide text-[#64748B]">
        L{diagnostic.line}:C{diagnostic.column}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-[#0F172A]">
        {diagnostic.message}
      </span>
    </>
  );
  if (onSelect === undefined) {
    return (
      <li className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-3 py-2 text-xs">
        {body}
      </li>
    );
  }
  return (
    <li>
      <button
        className="w-full rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-3 py-2 text-left transition-colors hover:bg-[#EF4444]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 motion-reduce:transition-none"
        onClick={() => onSelect(diagnostic.line, diagnostic.column)}
        type="button"
      >
        {body}
      </button>
    </li>
  );
}

export interface QuizMarkdownPreviewProps {
  readonly onChange?: (value: string) => void;
  readonly onDiagnosticSelect?: (line: number, column: number) => void;
  readonly onQuestionSelect?: (question: QuizPreviewQuestion) => void;
  /** Authoring mode: correct answers and explanations are visible. */
  readonly readOnly?: boolean;
  readonly source: string;
  readonly title?: string;
}

export function QuizMarkdownPreview({
  onChange,
  onDiagnosticSelect,
  onQuestionSelect,
  readOnly = false,
  source,
  title,
}: QuizMarkdownPreviewProps) {
  const analysis = analyzeQuizMarkdown(source);
  const generatedId = useId();
  // Toggling depends only on the source-change callback, never on the
  // optional question-navigation callback.
  const canToggle = !readOnly && onChange !== undefined;

  return (
    <section aria-labelledby={`${generatedId}-title`}>
      <h2
        className="mb-3 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
        id={`${generatedId}-title`}
      >
        {title ?? "Live preview (authoring)"}
      </h2>

      {analysis.diagnostics.length > 0 ? (
        <section aria-labelledby={`${generatedId}-diagnostics`}>
          <h3
            className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#EF4444]"
            id={`${generatedId}-diagnostics`}
          >
            Editor diagnostics
          </h3>
          <ul className="mt-2 space-y-2">
            {analysis.diagnostics.slice(0, 12).map((item, index) => (
              <DiagnosticItem
                diagnostic={item}
                key={`${item.code}-${item.line}-${index}`}
                onSelect={onDiagnosticSelect}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {analysis.questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs leading-relaxed text-[#64748B]">
          Start a question with{" "}
          <code className="font-mono text-[#0F172A]">Câu 1 [TYPE]:</code> to
          see the preview.
        </div>
      ) : (
        <div className="space-y-3">
          {analysis.questions.map((question, index) => (
            <PreviewQuestion
              key={`${question.number}-${index}`}
              onOptionToggle={
                canToggle
                  ? (selectedQuestion, selectedOption) =>
                      onChange(
                        toggleQuizOptionCorrectness(
                          source,
                          selectedQuestion,
                          selectedOption,
                        ),
                      )
                  : undefined
              }
              onQuestionSelect={onQuestionSelect}
              question={question}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </section>
  );
}
