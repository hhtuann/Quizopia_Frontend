"use client";

import { useState } from "react";
import { useUpdateDraftCompositionMutation } from "@/hooks/queries/use-exams";
import type { ExamDraftVersionResponse } from "@/lib/api/exams";
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

const inputClass =
  "w-full h-11 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const pointsClass =
  "w-24 h-10 rounded-button bg-[#E0E5EC] px-3 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E0E5EC] text-[#6B7280] shadow-inset-small outline-none transition-all duration-300 hover:text-[#3D4852] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:opacity-40";

const primaryBtn =
  "neumorphic-active-press inline-flex h-11 items-center justify-center rounded-button bg-[#6C63FF] px-6 text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60";

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE_MATRIX: "True/False",
  NUMERIC_FILL: "Numeric",
};

export function DraftEditor({
  examId,
  draft,
}: {
  examId: number;
  draft: ExamDraftVersionResponse;
}) {
  const mutation = useUpdateDraftCompositionMutation(examId);

  const [prevDraft, setPrevDraft] = useState(draft);
  const [sections, setSections] = useState<LocalSection[]>(() => toLocalSections(draft));
  const [dirty, setDirty] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // Resync local state when the server draft changes. Initial load is handled
  // by the lazy initializer; this block fires after a successful save or a 409
  // conflict refetch. Using the "adjust state when a prop changes" pattern
  // (during render) instead of useEffect to avoid cascading renders. Local
  // edits are preserved between refetches — react-query keeps a stable `draft`
  // reference until new data arrives.
  if (draft !== prevDraft) {
    setPrevDraft(draft);
    setSections(toLocalSections(draft));
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
      await mutation.mutateAsync(
        toRequestBody(
          draft.versionNumber,
          draft.durationMinutes,
          draft.instructions,
          sections
        )
      );
      setSavedNotice(true);
      setDirty(false);
      // The mutation's onSuccess invalidates → editor refetches → effect resyncs.
    } catch (err) {
      const mapped = describeSaveError(err);
      setSaveError(mapped.message);
      setSavedNotice(false);
      // On 409 conflict the mutation onError refetches the editor; the effect
      // will resync local state to the latest server draft (no overwrite-save).
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#3D4852]">
            Draft composition
          </h2>
          <p className="mt-1 text-xs font-medium text-[#6B7280]">
            Version {draft.versionNumber} · {sections.length} section
            {sections.length === 1 ? "" : "s"} · positions follow insertion order.
          </p>
        </div>
        <button type="button" onClick={handleSave} disabled={!canSave} className={primaryBtn}>
          {mutation.isPending ? "Saving…" : "Save draft"}
        </button>
      </div>

      {savedNotice && (
        <div
          role="status"
          className="rounded-2xl bg-[#E0E5EC] p-4 text-sm font-semibold text-[#38B2AC] shadow-inset-pressed"
        >
          Draft saved. Answer snapshots for newly added questions are now pinned.
        </div>
      )}
      {validationError && dirty && (
        <div role="status" className="rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-pressed">
          {validationError}
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep"
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
        <div key={section.uid} className="rounded-container bg-[#E0E5EC] p-5 shadow-extruded">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-inner bg-[#E0E5EC] px-2 py-1 text-xs font-bold uppercase tracking-wider text-[#6B7280] shadow-inset-small">
              Section {sIndex + 1}
            </span>
            <button
              type="button"
              onClick={() => removeSection(section.uid)}
              aria-label={`Remove section ${sIndex + 1}`}
              className={iconBtn + " hover:text-[#6C63FF]"}
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
          </div>

          <label className="mb-1.5 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            Title
          </label>
          <input
            type="text"
            value={section.title}
            onChange={(e) => patchSection(section.uid, { title: e.target.value })}
            placeholder="Section title"
            aria-invalid={section.title.trim() === ""}
            className={inputClass + " mb-4"}
          />

          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              Questions ({section.questions.length})
            </p>
            <button
              type="button"
              onClick={() => setPickerFor(section.uid)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl bg-[#E0E5EC] px-3 text-xs font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
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
          </div>

          {pickerFor === section.uid && (
            <div className="mb-4">
              <QuestionPicker
                excludeSourceIds={allSourceIds}
                onAdd={(qs) => addQuestions(section.uid, qs)}
                onClose={() => setPickerFor(null)}
              />
            </div>
          )}

          {section.questions.length === 0 ? (
            <p className="rounded-2xl bg-[#E0E5EC] px-4 py-6 text-center text-xs text-[#6B7280] shadow-inset-small">
              No questions yet. Use “Add from bank”.
            </p>
          ) : (
            <ul className="space-y-3">
              {section.questions.map((q, qIndex) => (
                <li key={q.uid} className="rounded-2xl bg-[#E0E5EC] p-4 shadow-inset-pressed">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(section.uid, qIndex, -1)}
                        disabled={qIndex === 0}
                        aria-label="Move up"
                        className={iconBtn + " h-7 w-7"}
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
                        className={iconBtn + " h-7 w-7"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-inner bg-[#E0E5EC] px-1.5 py-0.5 font-mono text-[10px] shadow-inset-small">
                          {q.code}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                          {TYPE_LABEL[q.type] ?? q.type}
                        </span>
                        {q.difficulty && (
                          <span className="text-[10px] capitalize text-[#6B7280]">
                            {q.difficulty.toLowerCase()}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-[#3D4852]">{q.content}</p>
                      <div className="mt-3">
                        <QuestionAnswerView question={q} />
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
                        Points
                        <input
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
                          className={pointsClass}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeQuestion(section.uid, q.uid)}
                        aria-label={`Remove ${q.code}`}
                        className={iconBtn + " h-7 w-7 hover:text-[#6C63FF]"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-button bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add section
      </button>
    </section>
  );
}
