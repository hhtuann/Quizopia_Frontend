"use client";

import { useState } from "react";
import { useUpdateCompositionMutation } from "@/hooks/queries/use-exams";
import { Button, Input, cardVariants, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { TeacherExamEditorResponse } from "@/lib/api/exams";
import {
  nextUid,
  toLocalSections,
  toRequestBody,
  validateComposition,
  describeSaveError,
  type LocalQuestion,
  type LocalSection,
} from "./types";
import { QuestionPicker } from "./QuestionPicker";
import { QuestionAnswerView } from "./QuestionAnswerView";
import { QuestionEditor } from "@/components/teacher/QuestionEditor";
import { ExamDetailSectionHeader } from "./ExamDetailSectionHeader";

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:opacity-40";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE_MATRIX: "True/False",
  NUMERIC_FILL: "Numeric",
};

/**
 * Composition editor (Questions tab). Bound to the editor response's
 * `composition`; saves with `expectedExamVersion = exam.examVersion`. After a
 * successful save the mutation writes the new editor response (with the
 * bumped `examVersion` + pinned snapshots) into the cache, and this component
 * resyncs from it.
 *
 * `readOnly` (PUBLISHED/ARCHIVED exams) hides every mutation affordance —
 * published content is an immutable snapshot.
 */
export function DraftEditor({
  exam,
  readOnly = false,
}: {
  exam: TeacherExamEditorResponse;
  readOnly?: boolean;
}) {
  const mutation = useUpdateCompositionMutation(exam.id);

  const [prevExam, setPrevExam] = useState(exam);
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [sections, setSections] = useState<LocalSection[]>(() =>
    toLocalSections(exam.composition)
  );
  const [dirty, setDirty] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // Resync local state when the server exam changes. Initial load is handled
  // by the lazy initializer; this block fires after a successful save or a 409
  // conflict refetch. Using the "adjust state when a prop changes" pattern
  // (during render) instead of useEffect to avoid cascading renders. Local
  // edits are preserved between refetches — react-query keeps a stable `exam`
  // reference until new data arrives.
  if (exam !== prevExam) {
    setPrevExam(exam);
    setSections(toLocalSections(exam.composition));
    setDirty(false);
    setSaveError(null);
  }

  const allSourceIds = sections.flatMap((s) => s.questions.map((q) => q.sourceQuestionId));

  const markDirty = () => {
    setDirty(true);
    setSavedNotice(false);
    setSaveError(null);
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { uid: nextUid("sec"), title: "", instructions: "", questions: [] },
    ]);
    markDirty();
  };

  const removeSection = (uid: string) => {
    setSections((prev) => prev.filter((s) => s.uid !== uid));
    markDirty();
  };

  const patchSection = (uid: string, patch: Partial<LocalSection>) => {
    setSections((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
    markDirty();
  };

  const addQuestions = (uid: string, qs: LocalQuestion[]) => {
    setSections((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, questions: [...s.questions, ...qs] } : s))
    );
    markDirty();
  };

  const removeQuestion = (sectionUid: string, questionUid: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.uid === sectionUid
          ? { ...s, questions: s.questions.filter((q) => q.uid !== questionUid) }
          : s
      )
    );
    markDirty();
  };

  const setPoints = (sectionUid: string, questionUid: string, value: number | null) => {
    setSections((prev) =>
      prev.map((s) =>
        s.uid === sectionUid
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.uid === questionUid ? { ...q, defaultPoints: value } : q
              ),
            }
          : s
      )
    );
    markDirty();
  };

  const moveQuestion = (sectionUid: string, index: number, delta: -1 | 1) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.uid !== sectionUid) return s;
        const qs = s.questions.slice();
        const target = index + delta;
        if (target < 0 || target >= qs.length) return s;
        [qs[index], qs[target]] = [qs[target], qs[index]];
        return { ...s, questions: qs };
      })
    );
    markDirty();
  };

  const validationError = validateComposition(sections);
  const canSave = dirty && !mutation.isPending && validationError === null;

  const handleSave = async () => {
    setSaveError(null);
    try {
      // The response carries the NEW examVersion + pinned snapshots and is
      // written into the editor cache by the mutation — the resync above
      // rebuilds local state from it.
      await mutation.mutateAsync(
        toRequestBody(
          exam.examVersion,
          exam.durationMinutes,
          exam.instructions,
          sections
        )
      );
      setSavedNotice(true);
      setDirty(false);
    } catch (err) {
      const mapped = describeSaveError(err);
      setSaveError(mapped.message);
      setSavedNotice(false);
      // On 409 conflict the mutation onError refetches the editor; the block
      // above resyncs local state to the latest server data (no overwrite-save).
    }
  };

  return (
    <section className="space-y-5">
      <ExamDetailSectionHeader
        title={readOnly ? "Questions (read-only)" : "Composition"}
        subtitle={
          <>
            {sections.length} section{sections.length === 1 ? "" : "s"} ·{" "}
            {allSourceIds.length} question{allSourceIds.length === 1 ? "" : "s"} ·{" "}
            {readOnly
              ? "published content is immutable — duplicate the exam to change it."
              : "positions follow insertion order."}
          </>
        }
        actions={
          !readOnly ? (
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          ) : undefined
        }
      />

      {savedNotice && (
        <div
          role="status"
          className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm font-semibold text-[#10B981]"
        >
          Composition saved. Answer snapshots for newly added questions are now pinned.
        </div>
      )}
      {validationError && dirty && !readOnly && (
        <div role="status" className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 text-sm font-medium text-[#0F172A]">
          {validationError}
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <span>{saveError}</span>
        </div>
      )}

      {sections.map((section, sIndex) => (
        <div key={section.uid} className={cn(cardVariants(), "p-5")}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Section {sIndex + 1}
            </span>
            {readOnly ? (
              <p className="min-w-0 flex-1 truncate rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[#0F172A]">
                {section.title}
              </p>
            ) : (
              <Input
                type="text"
                value={section.title}
                onChange={(e) => patchSection(section.uid, { title: e.target.value })}
                placeholder="Section title"
                aria-label={`Section ${sIndex + 1} title`}
                aria-invalid={section.title.trim() === ""}
                className="min-w-40 flex-1"
              />
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => removeSection(section.uid)}
                aria-label={`Remove section ${sIndex + 1}`}
                className={cn(iconBtn, "hover:text-[#EF4444]")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
              Questions ({section.questions.length})
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setPickerFor(section.uid)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add from bank
              </button>
            )}
          </div>

          {pickerFor === section.uid && !readOnly && (
            <div className="mb-4">
              <QuestionPicker
                excludeSourceIds={allSourceIds}
                onAdd={(qs) => addQuestions(section.uid, qs)}
                onClose={() => setPickerFor(null)}
              />
            </div>
          )}

          {section.questions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
              No questions in this section{readOnly ? "." : " — use “Add from bank”."}
            </p>
          ) : (
            <ul className="space-y-3">
              {section.questions.map((q, qIndex) => (
                <li key={q.uid} className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-4">
                  <div className="flex items-start gap-3">
                    {!readOnly && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveQuestion(section.uid, qIndex, -1)}
                          disabled={qIndex === 0}
                          aria-label="Move up"
                          className={cn(iconBtn, "h-7 w-7")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(section.uid, qIndex, 1)}
                          disabled={qIndex === section.questions.length - 1}
                          aria-label="Move down"
                          className={cn(iconBtn, "h-7 w-7")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#64748B]">
                          {q.code}
                        </span>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                          {TYPE_LABEL[q.type] ?? q.type}
                        </span>
                        {q.difficulty && (
                          <span className="text-[10px] capitalize text-[#64748B]">
                            {q.difficulty.toLowerCase()}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-[#0F172A]">{q.content}</p>
                      <div className="mt-3">
                        <QuestionAnswerView question={q} />
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#64748B]">
                        Points
                        {readOnly ? (
                          <span className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 tabular-nums text-[#0F172A]">
                            {q.defaultPointsServer ?? q.defaultPoints ?? "—"}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.25"
                            value={q.defaultPoints ?? ""}
                            placeholder={q.defaultPointsServer != null ? String(q.defaultPointsServer) : "default"}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPoints(section.uid, q.uid, v === "" ? null : Number(v));
                            }}
                            aria-label={`Points for ${q.code}`}
                            className="w-24 h-10 px-3"
                          />
                        )}
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditTarget(q.sourceQuestionId)}
                          aria-label={`Edit source ${q.code}`}
                          className={cn(iconBtn, "h-7 w-7 hover:text-[#0052FF]")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeQuestion(section.uid, q.uid)}
                            aria-label={`Remove ${q.code}`}
                            className={cn(iconBtn, "h-7 w-7 hover:text-[#EF4444]")}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {!readOnly && (
        <button
          type="button"
          onClick={addSection}
          className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add section
        </button>
      )}

      {editTarget !== null && (
        <QuestionEditor
          questionId={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => setEditTarget(null)}
        />
      )}
    </section>
  );
}
