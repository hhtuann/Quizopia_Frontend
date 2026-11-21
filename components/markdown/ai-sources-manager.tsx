"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { AiExtractedDocument } from "@/lib/api/ai-authoring";

/** One managed source row: extracted document or a failed upload. */
export interface AiSourceItem {
  readonly id: string;
  readonly name: string;
  /** Extracted document when the upload succeeded; null while loading/failed. */
  readonly document: AiExtractedDocument | null;
  readonly status: "loading" | "ready" | "error";
  /** Human-readable failure for `status: "error"`. */
  readonly error: string | null;
  /** Whether this source is attached to the next author request. */
  readonly selected: boolean;
}

/**
 * NotebookLM-style compact sources manager (Quizopia_System #121, UX-03).
 *
 * A dialog with its own scroll area: search box, per-source status
 * (extracting / chars + truncated / error), selection toggles, removal, and
 * an upload action. The conversation never grows with sources — the composer
 * only shows the `N Sources` counter.
 *
 * Budget honesty: the caller passes the backend caps (max documents per
 * request, max total chars); the footer shows exactly how many sources will
 * be sent, and the owner (chat) refuses selections beyond the caps.
 */
export function AiSourcesManager({
  items,
  maxDocuments,
  maxTotalChars,
  onRemove,
  onSelectToggle,
  onUploadClick,
  onDismiss,
  open,
  uploading,
}: {
  readonly items: readonly AiSourceItem[];
  /** Backend `maxDocuments` per author request. */
  readonly maxDocuments: number;
  /** Backend `maxTotalDocumentChars` per author request. */
  readonly maxTotalChars: number;
  readonly onRemove: (id: string) => void;
  readonly onSelectToggle: (id: string) => void;
  readonly onUploadClick: () => void;
  readonly onDismiss: () => void;
  readonly open: boolean;
  readonly uploading: boolean;
}) {
  const titleId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC closes; focus starts on the dialog.
  useEffect(() => {
    if (!open) {
      return;
    }
    const node = dialogRef.current;
    node?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  const selected = useMemo(() => items.filter((i) => i.selected && i.document !== null), [items]);
  const selectedChars = useMemo(
    () => selected.reduce((sum, i) => sum + (i.document?.charCount ?? 0), 0),
    [selected],
  );
  const overBudget = selected.length > maxDocuments || selectedChars > maxTotalChars;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-[#0F172A]/30 p-3 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby={titleId}
        className="flex max-h-[min(28rem,80vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus-visible:outline-none"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#0F172A]" id={titleId}>
            Sources
          </h2>
          <button
            aria-label="Close sources"
            className="rounded-lg p-1.5 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
            onClick={onDismiss}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="px-4 pt-3">
          <label className="sr-only" htmlFor={searchId}>
            Search sources
          </label>
          <input
            className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs text-[#0F172A] placeholder:text-[#64748B]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
            id={searchId}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sources…"
            type="search"
            value={query}
          />
        </div>

        <div
          aria-label="Source list"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
          role="list"
        >
          {filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-[#64748B]">
              {items.length === 0
                ? "No sources yet — upload a .txt, .pdf, .docx or .pptx file (max 5 MiB each)."
                : "No sources match your search."}
            </p>
          )}
          {filtered.map((item) => (
            <div
              className="flex items-start gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-[#F8FAFC]"
              key={item.id}
              role="listitem"
            >
              <input
                aria-label={`Attach ${item.name}`}
                checked={item.selected}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0052FF]"
                disabled={item.status !== "ready"}
                onChange={() => onSelectToggle(item.id)}
                type="checkbox"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#0F172A]" title={item.name}>
                  {item.name}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[11px] leading-relaxed",
                    item.status === "error" ? "text-[#EF4444]" : "text-[#64748B]",
                  )}
                >
                  {item.status === "loading" && "Extracting…"}
                  {item.status === "ready" &&
                    item.document &&
                    `${item.document.charCount.toLocaleString()} chars${
                      item.document.truncated ? " — truncated" : ""
                    }`}
                  {item.status === "error" && item.error}
                </p>
              </div>
              <button
                aria-label={`Remove ${item.name}`}
                className="rounded-lg p-1.5 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                onClick={() => onRemove(item.id)}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-[#E2E8F0] px-4 py-3">
          <p
            className={cn(
              "text-[11px] font-medium leading-relaxed",
              overBudget ? "text-[#EF4444]" : "text-[#64748B]",
            )}
            role="status"
          >
            {selected.length} of {items.length} attached · {selectedChars.toLocaleString()} /{" "}
            {maxTotalChars.toLocaleString()} chars · max {maxDocuments} per request
            {overBudget
              ? ` — detach ${selected.length - maxDocuments} source${
                  selected.length - maxDocuments === 1 ? "" : "s"
                } or pick smaller ones before sending`
              : ""}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={uploading}
              onClick={onUploadClick}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="14"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {uploading ? "Extracting…" : "Upload"}
            </button>
            <button
              className="inline-flex h-9 items-center rounded-lg bg-[#0052FF] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#4D7CFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
              onClick={onDismiss}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
