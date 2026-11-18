"use client";

import { useEffect, useRef, useState } from "react";
import {
  QuizMarkdownCodeEditor,
  type QuizMarkdownCodeEditorHandle,
} from "./quiz-markdown-code-editor";
import { AiAuthoringChat } from "./ai-authoring-chat";
import { QuizMarkdownPreview } from "./quiz-markdown-preview";

/**
 * Split Markdown authoring surface: source editor and live preview side by
 * side on desktop with independent vertical scrolling, and an accessible
 * Editor/Preview switch on small screens. Both panes stay mounted so source
 * and caret state survive switching. With `bankId`, the right pane gains an
 * AI Assistant tab (Phase 5, issue #114) — chat and preview stay mounted so
 * their state survives switching too.
 */
type Pane = "editor" | "preview" | "ai";
type RightPaneView = "preview" | "ai";

const PANE_LABEL: Record<Pane, string> = {
  editor: "Editor",
  preview: "Preview",
  ai: "AI",
};

function PaneSwitch({
  active,
  onChange,
  panes,
}: {
  readonly active: Pane;
  readonly onChange: (pane: Pane) => void;
  readonly panes: readonly Pane[];
}) {
  const base =
    "h-9 rounded-lg px-4 font-mono text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2";
  return (
    <div
      aria-label="Authoring view"
      className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1 shadow-[0_4px_6px_rgba(0,0,0,0.07)]"
      role="group"
    >
      {panes.map((pane) => (
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
          {PANE_LABEL[pane]}
        </button>
      ))}
    </div>
  );
}

const RIGHT_TABS: readonly { readonly id: RightPaneView; readonly label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "ai", label: "AI Assistant" },
];

/**
 * Desktop tablist switching the right pane between the live preview and the
 * AI Assistant. WAI-ARIA tabs pattern: roving tabindex + ArrowLeft/ArrowRight.
 */
function RightPaneTabs({
  view,
  onChange,
}: {
  readonly view: RightPaneView;
  readonly onChange: (view: RightPaneView) => void;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const keyboardFocusRef = useRef<number | null>(null);

  useEffect(() => {
    if (keyboardFocusRef.current !== null) {
      buttonRefs.current[keyboardFocusRef.current]?.focus();
      keyboardFocusRef.current = null;
    }
  }, [view]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = RIGHT_TABS.findIndex((tab) => tab.id === view);
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    const next = (current + delta + RIGHT_TABS.length) % RIGHT_TABS.length;
    keyboardFocusRef.current = next;
    onChange(RIGHT_TABS[next].id);
  };

  return (
    <div
      aria-label="Right pane view"
      className="mb-2 hidden items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1 shadow-[0_4px_6px_rgba(0,0,0,0.07)] lg:flex"
      onKeyDown={onKeyDown}
      role="tablist"
    >
      {RIGHT_TABS.map((tab, index) => (
        <button
          aria-controls={`authoring-panel-${tab.id}`}
          aria-selected={view === tab.id}
          className={`h-9 rounded-lg px-4 font-mono text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 ${
            view === tab.id
              ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
              : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          }`}
          id={`authoring-tab-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          role="tab"
          tabIndex={view === tab.id ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export interface QuizMarkdownAuthoringPaneProps {
  /** Question-bank id; when set, the right pane gains the AI Assistant tab. */
  readonly bankId?: number;
  readonly onChange: (value: string) => void;
  /** Authoring mode shows answers/explanations in the preview. */
  readonly readOnly?: boolean;
  /** Internal heading; pass null to render none (host supplies its own). */
  readonly title?: string | null;
  readonly value: string;
}

export function QuizMarkdownAuthoringPane({
  bankId,
  onChange,
  readOnly = false,
  title,
  value,
}: QuizMarkdownAuthoringPaneProps) {
  const editorRef = useRef<QuizMarkdownCodeEditorHandle>(null);
  const [activePane, setActivePane] = useState<Pane>("editor");
  // Desktop tab / mobile switch selection for the right pane.
  const [rightView, setRightView] = useState<RightPaneView>("preview");
  const hasAi = bankId !== undefined;
  // Mobile PaneSwitch: Editor/Preview two-way, or 3-way with AI when bankId is set.
  const panes: readonly Pane[] = hasAi ? ["editor", "preview", "ai"] : ["editor", "preview"];
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

  // Mobile 3-way switch: selecting Preview/AI also drives the desktop tab
  // selection so both controls always agree on the visible right-pane child.
  const handlePaneChange = (pane: Pane) => {
    setActivePane(pane);
    if (pane !== "editor") {
      setRightView(pane);
    }
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
          <PaneSwitch active={activePane} onChange={handlePaneChange} panes={panes} />
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
          className={`flex min-h-0 flex-col ${
            activePane === "editor" ? "hidden lg:flex" : "flex"
          }`}
        >
          {hasAi && <RightPaneTabs view={rightView} onChange={setRightView} />}
          {/* Both right-pane children stay mounted (CSS hidden) so preview
              and chat state survive tab switching. */}
          <div
            aria-labelledby="authoring-tab-preview"
            className={`min-h-0 flex-1 ${
              !hasAi || rightView === "preview" ? "" : "hidden"
            }`}
            id="authoring-panel-preview"
            role="tabpanel"
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
          {hasAi && (
            <div
              aria-labelledby="authoring-tab-ai"
              className={`min-h-0 flex-1 ${rightView === "ai" ? "" : "hidden"}`}
              id="authoring-panel-ai"
              role="tabpanel"
            >
              <AiAuthoringChat bankId={bankId} onChange={onChange} value={value} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
