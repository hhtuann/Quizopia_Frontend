"use client";

import { cn } from "@/lib/utils/cn";
import { Badge, buttonVariants } from "@/components/ui";
import { useQuestionDetailQuery } from "@/hooks/queries/use-questions";
import type { QuestionSummary } from "@/lib/api/question-banks";
import type { Difficulty, QuestionStatus } from "@/lib/api/question-banks";
import { QuestionAnswerView } from "@/components/teacher/exam-editor/QuestionAnswerView";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE_MATRIX: "True / False",
  NUMERIC_FILL: "Numeric fill",
};

function statusVariant(status: QuestionStatus): "default" | "success" | "warn" {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warn";
  return "default";
}

const iconBtn =
  "inline-flex items-center justify-center rounded-md text-[#64748B] outline-none transition-colors hover:bg-[#E2E8F0] focus-visible:ring-2 focus-visible:ring-[#0052FF]";

export function QuestionCard({
  question,
  onEdit,
}: {
  question: QuestionSummary;
  onEdit: (id: number) => void;
}) {
  const { data: detail } = useQuestionDetailQuery(question.id);

  // Build a QuestionAnswerView-compatible object from the detail.
  const answerViewProps = detail
    ? {
        question: {
          uid: String(question.id),
          sourceQuestionId: question.id,
          defaultPoints: detail.defaultPoints,
          code: detail.code,
          type: detail.questionType,
          content: detail.content,
          difficulty: detail.difficulty,
          defaultPointsServer: detail.defaultPoints,
          hasSnapshot: true,
          answerKey: detail.answerKey,
          options: detail.options.map((o, i) => ({
            id: i + 1,
            optionKey: o.optionKey,
            content: o.content,
            isCorrect: o.isCorrect,
            position: o.position,
          })),
        },
      }
    : null;

  return (
    <li className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#64748B]">
              {question.code}
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
              {TYPE_LABEL[question.questionType] ?? question.questionType}
            </span>
            {question.difficulty && (
              <span className="text-[10px] capitalize text-[#64748B]">
                {(question.difficulty as Difficulty).toLowerCase()}
              </span>
            )}
            <Badge variant={statusVariant(question.status)}>{question.status}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-[#0F172A]">{question.content}</p>
          {answerViewProps && (
            <div className="mt-3">
              <QuestionAnswerView question={answerViewProps.question} />
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(question.id)}
            aria-label={`Edit ${question.code}`}
            className={cn(iconBtn, "h-7 w-7 hover:text-[#0052FF]")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}

export function QuestionList({
  items,
  onEdit,
}: {
  items: QuestionSummary[];
  onEdit: (id: number) => void;
}) {
  return (
    <ul className="space-y-3">
      {items.map((q) => (
        <QuestionCard key={q.id} question={q} onEdit={onEdit} />
      ))}
    </ul>
  );
}
