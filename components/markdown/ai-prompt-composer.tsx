"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * ChatGPT-style prompt composer for the AI authoring assistant
 * (Quizopia_System #121, UX-02).
 *
 * One bordered container: auto-growing bounded textarea on top; upload/plus
 * control bottom-left, `N Sources` entry point next to it, Send (arrow-up)
 * button bottom-right — all INSIDE the composer.
 *
 * Keyboard contract: `Enter` sends, `Shift+Enter` inserts a newline,
 * `Ctrl/Cmd+Enter` always sends. IME composition (Vietnamese Telex/VNI) is
 * guarded: no send while composing, and the Enter that CONFIRMS a
 * composition does not send either.
 */
export function AiPromptComposer({
  disabled = false,
  onSend,
  onUploadClick,
  pending = false,
  placeholder = "Ask the assistant to draft or rework questions…",
  sourcesCount,
  sourcesLabel,
  onSourcesClick,
  uploadDisabled,
  uploadLabel = "Upload document",
  value,
  onChange,
}: {
  readonly disabled?: boolean;
  readonly onSend: () => void;
  readonly onUploadClick: () => void;
  readonly pending?: boolean;
  readonly placeholder?: string;
  /** Number of extracted sources (drives the `N Sources` affordance). */
  readonly sourcesCount: number;
  readonly sourcesLabel?: string;
  readonly onSourcesClick: () => void;
  readonly uploadDisabled?: boolean;
  readonly uploadLabel?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);
  const sendBlocked = disabled || pending || value.trim().length === 0;

  // Auto-grow the textarea up to a bound, then scroll internally.
  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME guard: while a Vietnamese (or any) composition is active, Enter
    // confirms the composition — never sends. This also covers the keydown
    // that arrives with isComposing true right before compositionend.
    if (event.nativeEvent.isComposing || composing) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sendBlocked) {
        onSend();
      }
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!sendBlocked) {
        onSend();
      }
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-colors focus-within:border-[#0052FF]/60",
        disabled && "opacity-60",
      )}
      data-testid="ai-prompt-composer"
    >
      <label className="sr-only" htmlFor={textareaId}>
        Message the AI assistant
      </label>
      <textarea
        className="block max-h-[200px] w-full resize-none bg-transparent px-3.5 pt-3 text-sm leading-relaxed text-[#0F172A] placeholder:text-[#64748B]/70 focus-visible:outline-none disabled:cursor-not-allowed"
        disabled={disabled}
        id={textareaId}
        onChange={(event) => {
          onChange(event.target.value);
          resize(event.target);
        }}
        onCompositionEnd={() => setComposing(false)}
        onCompositionStart={() => setComposing(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={(el) => {
          textareaRef.current = el;
          if (el !== null) {
            resize(el);
          }
        }}
        rows={1}
        value={value}
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            aria-label={uploadLabel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={uploadDisabled ?? disabled}
            onClick={onUploadClick}
            title={uploadLabel}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path
                d="M12 5v14M5 12h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            aria-label={sourcesLabel ?? `${sourcesCount} sources`}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]",
              sourcesCount > 0
                ? "bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0]"
                : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            disabled={disabled}
            onClick={onSourcesClick}
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
              <path
                d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="whitespace-nowrap">
              {sourcesCount} Source{sourcesCount === 1 ? "" : "s"}
            </span>
          </button>
        </div>
        <button
          aria-label="Send message"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0052FF] text-white transition-all hover:bg-[#4D7CFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={sendBlocked}
          onClick={() => {
            if (!sendBlocked) {
              onSend();
            }
          }}
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
            <path
              d="M12 19V5M5 12l7-7 7 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
