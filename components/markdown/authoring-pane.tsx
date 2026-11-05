"use client";

import { useEffect, useRef, useState } from "react";
import {
  QuizMarkdownCodeEditor,
  type QuizMarkdownCodeEditorHandle,
} from "./quiz-markdown-code-editor";
import { QuizMarkdownPreview } from "./quiz-markdown-preview";

/**
 * Split Markdown authoring surface: source editor and live preview side by
 * side on desktop with independent vertical scrolling, and an accessible
 * Editor/Preview switch on small screens. Both panes stay mounted so source
 * and caret state survive switching.
 */

type Pane = "editor" | "preview";

function PaneSwitch({
  active,
  onChange,
}: {
  readonly active: Pane;
  readonly onChange: (pane: Pane) => void;
}) {
  const base =
    "h-9 rounded-lg px-4 font-mono text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2";
  return (
    <div
      aria-label="Authoring view"
      className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1 shadow-[0_4px_6px_rgba(0,0,0,0.07)]"
      role="group"
    >
      {(["editor", "preview"] as const).map((pane) => (
        <button
          aria-pressed={active === pane}
          className={`${base} ${
            active === pane
              ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
              : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          }`}
          key={pane}
          onClick={() => onChange(pane)}
          type="button"
        >
          {pane === "editor" ? "Editor" : "Preview"}
        </button>
      ))}
    </div>
  );
}

export interface QuizMarkdownAuthoringPaneProps {
  readonly onChange: (value: string) => void;
  /** Authoring mode shows answers/explanations in the preview. */
  readonly readOnly?: boolean;
  readonly title?: string;
  readonly value: string;
}

export function QuizMarkdownAuthoringPane({
  onChange,
  readOnly = false,
  title,
  value,
}: QuizMarkdownAuthoringPaneProps) {
  const editorRef = useRef<QuizMarkdownCodeEditorHandle>(null);
  const [activePane, setActivePane] = useState<Pane>("editor");
  // Navigation requested while the editor pane is CSS-hidden (mobile preview
  // mode): applied after the pane becomes visible, because focusing a hidden
  // textarea is a no-op in real browsers.
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (activePane !== "editor") {
      return;
    }
    const pending = pendingNavigationRef.current;
    if (pending !== null) {
      pendingNavigationRef.current = null;
      pending();
    }
  }, [activePane]);

  const navigateEditor = (focus: (editor: QuizMarkdownCodeEditorHandle) => void) => {
    if (activePane === "editor") {
      const editor = editorRef.current;
      if (editor !== null) {
        focus(editor);
      }
      return;
    }
    pendingNavigationRef.current = () => {
      const editor = editorRef.current;
      if (editor !== null) {
        focus(editor);
      }
    };
    setActivePane("editor");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          {title ?? "Quiz Markdown authoring"}
        </h2>
        <div className="lg:hidden">
          <PaneSwitch active={activePane} onChange={setActivePane} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-2">
        <div
          className={`flex min-h-[24rem] flex-col lg:min-h-0 ${
            activePane === "editor" ? "" : "hidden lg:flex"
          }`}
        >
          <QuizMarkdownCodeEditor
            disabled={readOnly}
            onChange={onChange}
            ref={editorRef}
            value={value}
          />
        </div>
        <div
          className={`min-h-0 lg:overflow-y-auto lg:pr-1 ${
            activePane === "preview" ? "" : "hidden lg:block"
          }`}
        >
          <QuizMarkdownPreview
            onChange={onChange}
            onDiagnosticSelect={(line, column) =>
              navigateEditor((editor) =>
                editor.focusLocation(line, column, {
                  suppressAutocomplete: true,
                }),
              )
            }
            onQuestionSelect={(question) =>
              navigateEditor((editor) =>
                editor.focusOffset(question.source.offset, {
                  suppressAutocomplete: true,
                }),
              )
            }
            readOnly={readOnly}
            source={value}
          />
        </div>
      </div>
    </div>
  );
}
