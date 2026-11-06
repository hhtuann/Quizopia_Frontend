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
  /** Internal heading; pass null to render none (host supplies its own). */
  readonly title?: string | null;
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
  // Desktop splitter: percentage width of the EDITOR column (25–75%).
  const [editorRatio, setEditorRatio] = useState(50);
  const gridRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const applyRatioFromClientX = (clientX: number) => {
    const grid = gridRef.current;
    if (grid === null) {
      return;
    }
    const bounds = grid.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }
    const percent = ((clientX - bounds.left) / bounds.width) * 100;
    setEditorRatio(Math.min(75, Math.max(25, percent)));
  };
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
        {title !== null ? (
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            {title ?? "Quiz Markdown authoring"}
          </h2>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="lg:hidden">
          <PaneSwitch active={activePane} onChange={setActivePane} />
        </div>
      </div>

      <div
        className={`grid min-h-0 flex-1 gap-0 lg:[grid-template-columns:var(--split-grid)] ${
          dragging ? "select-none" : ""
        }`}
        onPointerMove={(event) => {
          if (draggingRef.current) {
            applyRatioFromClientX(event.clientX);
          }
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        ref={gridRef}
        style={{ "--split-grid": `${editorRatio}% 0.375rem 1fr` } as React.CSSProperties}
      >
        <div
          className={`min-h-[24rem] lg:min-h-0 ${
            activePane === "editor" ? "" : "hidden lg:block"
          }`}
        >
          <QuizMarkdownCodeEditor
            disabled={readOnly}
            onChange={onChange}
            ref={editorRef}
            value={value}
          />
        </div>

        {/* Desktop splitter between editor and preview (drag or arrow keys). */}
        <div
          aria-label="Resize editor and preview"
          aria-orientation="vertical"
          aria-valuenow={Math.round(editorRatio)}
          role="separator"
          tabIndex={0}
          className={`hidden w-1.5 shrink-0 cursor-col-resize touch-none rounded-full transition-colors lg:block ${
            dragging ? "bg-[#0052FF]" : "bg-transparent hover:bg-[#0052FF]/30"
          }`}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setEditorRatio((ratio) => Math.max(25, ratio - 5));
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setEditorRatio((ratio) => Math.min(75, ratio + 5));
            }
          }}
          onPointerDown={(event) => {
            draggingRef.current = true;
            setDragging(true);
            (event.target as HTMLElement).setPointerCapture(event.pointerId);
          }}
        />

        <div
          className={`min-h-0 ${activePane === "preview" ? "" : "hidden lg:block"}`}
        >
          <QuizMarkdownPreview
            boxed
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
