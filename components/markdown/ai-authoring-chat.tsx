"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  useAiAuthoringStatusQuery,
  useAuthorAiMarkdownMutation,
  useExtractAiDocumentMutation,
} from "@/hooks/queries/use-ai-authoring";
import type {
  AiAuthorDiagnostic,
  AiAuthorMessage,
  AiAuthorRequest,
  AiAuthorResponse,
  AiExtractedDocument,
} from "@/lib/api/ai-authoring";
import type { NormalizedApiError } from "@/lib/api";

/** Mirrors the backend extraction cap — pre-checked client-side for instant feedback. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Prior chat turns sent back with each author request (most recent last). */
const HISTORY_LIMIT = 20;

/** Latest assistant candidate + the editor source it was authored against. */
interface ChatCandidate {
  readonly markdown: string;
  readonly reply: string;
  readonly valid: boolean;
  readonly diagnostics: readonly AiAuthorDiagnostic[];
  readonly sourceAtRequest: string;
}

function describeError(err: unknown): string {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api") {
    if (norm.status === 429) return "The AI service is busy — wait a moment and try again.";
    if (norm.status >= 500) return "The AI service failed to process the request. Try again.";
    return norm.message || "The AI request failed. Please try again.";
  }
  if (norm?.kind === "http") {
    if (norm.status === 403) return "AI Assistant is not available for this question bank.";
    if (norm.status === 429) return "The AI service is busy — wait a moment and try again.";
    if (norm.status >= 500) return "The AI service failed to process the request. Try again.";
    return norm.message || `Request failed (HTTP ${norm.status}).`;
  }
  if (norm?.kind === "network") {
    return "Network error — check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * AI Assistant chat for the Quiz Markdown authoring pane (Phase 5, #114).
 *
 * Session-only client state (no persistence): uploaded documents, the chat
 * log, and the latest assistant candidate. Every turn sends the CURRENT
 * editor Markdown; the candidate remembers the source it was authored
 * against so a stale Apply can never silently overwrite editor edits.
 * Availability comes from the server probe — any error is "unavailable" and
 * nothing about server keys/configuration is ever rendered.
 */
export function AiAuthoringChat({
  bankId,
  onChange,
  value,
}: {
  readonly bankId: number;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const instructionId = useId();

  const [documents, setDocuments] = useState<AiExtractedDocument[]>([]);
  const [messages, setMessages] = useState<AiAuthorMessage[]>([]);
  const [instruction, setInstruction] = useState("");
  const [candidate, setCandidate] = useState<ChatCandidate | null>(null);
  const [applied, setApplied] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<string | null>(null);
  const [confirmingStale, setConfirmingStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Latest editor source (for Apply-stale handling; updated post-commit, not
  // during render) + last issued request (for Retry).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const lastRequestRef = useRef<{ request: AiAuthorRequest; sourceAtRequest: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const statusQuery = useAiAuthoringStatusQuery(bankId);
  const extractMutation = useExtractAiDocumentMutation(bankId);
  const authorMutation = useAuthorAiMarkdownMutation(bankId);

  const loading = statusQuery.isPending;
  // Any probe error (incl. 403 for non-owners) counts as unavailable.
  const unavailable = statusQuery.isError || statusQuery.data?.available === false;
  const inputsDisabled = loading || unavailable;
  const pending = authorMutation.isPending;
  const uploading = extractMutation.isPending;
  const sendDisabled =
    inputsDisabled || pending || instruction.trim().length === 0;

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending]);

  const handleAuthorSuccess = (response: AiAuthorResponse, sourceAtRequest: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: response.reply }]);
    setCandidate({
      markdown: response.markdown,
      reply: response.reply,
      valid: response.valid,
      diagnostics: response.diagnostics,
      sourceAtRequest,
    });
    setApplied(false);
    setUndoSnapshot(null);
    setConfirmingStale(false);
  };

  const issueRequest = (request: AiAuthorRequest, sourceAtRequest: string) => {
    lastRequestRef.current = { request, sourceAtRequest };
    setError(null);
    authorMutation.mutate(request, {
      onSuccess: (response) => handleAuthorSuccess(response, sourceAtRequest),
      onError: (err) => setError(describeError(err)),
    });
  };

  const handleSend = () => {
    const trimmed = instruction.trim();
    if (trimmed.length === 0 || sendDisabled) {
      return;
    }
    const sourceAtRequest = valueRef.current;
    const history = messages.slice(-HISTORY_LIMIT);
    // The user turn is appended immediately and STAYS even when the request
    // fails (Retry re-issues the same request without duplicating it).
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInstruction("");
    setError(null);
    setConfirmingStale(false);
    issueRequest(
      {
        instruction: trimmed,
        currentMarkdown: sourceAtRequest,
        documents: documents.map((doc) => ({ name: doc.name, text: doc.text })),
        history,
      },
      sourceAtRequest,
    );
  };

  const handleRetry = () => {
    const last = lastRequestRef.current;
    if (last === null || pending) {
      return;
    }
    setError(null);
    authorMutation.mutate(last.request, {
      onSuccess: (response) => handleAuthorSuccess(response, last.sourceAtRequest),
      onError: (err) => setError(describeError(err)),
    });
  };

  const applyCandidate = () => {
    if (candidate === null) {
      return;
    }
    // Snapshot the PRE-apply editor source so Undo restores exactly it.
    setUndoSnapshot(valueRef.current);
    onChange(candidate.markdown);
    setApplied(true);
    setConfirmingStale(false);
  };

  const handleApplyClick = () => {
    if (candidate === null) {
      return;
    }
    if (valueRef.current !== candidate.sourceAtRequest) {
      setConfirmingStale(true);
      return;
    }
    applyCandidate();
  };

  const handleUndo = () => {
    if (undoSnapshot !== null) {
      onChange(undoSnapshot);
    }
    setApplied(false);
    setCandidate(null);
    setUndoSnapshot(null);
  };

  const handleDiscard = () => {
    setCandidate(null);
    setApplied(false);
    setConfirmingStale(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    const oversized = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    const accepted = files.filter((file) => file.size <= MAX_UPLOAD_BYTES);
    // Compute the message once: set-then-clear in the same batch would drop
    // the oversize notice whenever at least one other file is accepted.
    setUploadError(
      oversized === undefined
        ? null
        : `${oversized.name} is larger than 5 MiB — extract a smaller file.`,
    );
    if (accepted.length === 0) {
      return;
    }
    for (const file of accepted) {
      extractMutation.mutate(file, {
        onSuccess: (doc) => setDocuments((prev) => [...prev, doc]),
        onError: (err) => setUploadError(describeError(err)),
      });
    }
  };

  const removeDocument = (index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <section aria-label="AI Assistant" className="flex h-full min-h-0 flex-col gap-3">
      {/* Screen-reader announcements for pending / error / success. */}
      <p aria-live="polite" className="sr-only">
        {pending
          ? "The assistant is working on your request."
          : error !== null
            ? "The assistant request failed."
            : candidate !== null
              ? "The assistant replied with a candidate."
              : ""}
      </p>

      {loading && (
        <div
          aria-label="Checking AI Assistant availability"
          className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_4px_6px_rgba(0,0,0,0.07)]"
        >
          <div className="h-3 w-40 animate-pulse rounded-full bg-[#F1F5F9]" />
          <div className="mt-2 h-3 w-64 animate-pulse rounded-full bg-[#F1F5F9]" />
        </div>
      )}

      {unavailable && (
        <div className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-xs font-medium leading-relaxed text-[#92400E]">
          <span aria-hidden="true">ⓘ</span>
          <p>AI Assistant is unavailable on the server.</p>
        </div>
      )}

      {!loading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              accept=".txt,.pdf,.docx,.pptx"
              aria-label="Upload document"
              className="sr-only"
              disabled={inputsDisabled}
              multiple
              onChange={handleFileChange}
              type="file"
            />
            <Button
              disabled={inputsDisabled}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              Upload document
            </Button>
            <span className="text-[10px] font-medium text-[#64748B]">
              .txt .pdf .docx .pptx — max 5 MiB
            </span>
            {uploading && (
              <span aria-live="polite" className="text-[10px] font-medium text-[#64748B]">
                Extracting document…
              </span>
            )}
          </div>

          {uploadError !== null && (
            <p role="alert" className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-2.5 text-xs font-medium text-[#EF4444]">
              {uploadError}
            </p>
          )}

          {documents.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Uploaded documents">
              {documents.map((doc, index) => (
                <li
                  key={`${doc.name}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F1F5F9] py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-[#0F172A]"
                >
                  <span>
                    {doc.name} ({doc.charCount} chars
                    {doc.truncated ? ", truncated" : ""})
                  </span>
                  {doc.truncated && (
                    <span className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[#92400E]">
                      Truncated
                    </span>
                  )}
                  <button
                    aria-label={`Remove ${doc.name}`}
                    className="rounded-full p-0.5 text-[#64748B] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                    onClick={() => removeDocument(index)}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" className="h-3 w-3">
                      <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div
            aria-label="AI conversation"
            className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_4px_6px_rgba(0,0,0,0.05)]"
            ref={chatScrollRef}
          >
            {messages.length === 0 && !pending && (
              <p className="px-1 py-6 text-center text-xs leading-relaxed text-[#64748B]">
                Ask the AI to draft or rework questions, e.g. &ldquo;Add 5 multiple-choice
                questions about the uploaded document.&rdquo;
              </p>
            )}
            {messages.map((message, index) => (
              <div
                className={cn(
                  "max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                  message.role === "user"
                    ? "ml-auto bg-[#0052FF]/10 text-[#0F172A]"
                    : "bg-[#F1F5F9] text-[#0F172A]",
                )}
                key={index}
              >
                <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
                  {message.role === "user" ? "You" : "Assistant"}
                </span>
                {message.content}
              </div>
            ))}
            {pending && (
              <div className="max-w-[90%] rounded-xl bg-[#F1F5F9] px-3 py-2 text-xs font-medium text-[#64748B]" aria-live="polite">
                Assistant is thinking…
              </div>
            )}
          </div>

          {candidate !== null &&
            (applied ? (
              <div className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/5 p-3">
                <p className="text-xs font-semibold text-[#10B981]">
                  Applied to the editor — live validation is shown in the preview.
                </p>
                <div className="mt-2">
                  <Button onClick={handleUndo} size="sm" type="button" variant="outline">
                    Undo
                  </Button>
                </div>
              </div>
            ) : confirmingStale ? (
              <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-3">
                <p className="text-xs font-medium leading-relaxed text-[#92400E]">
                  The editor changed since this request. Apply anyway?
                </p>
                <div className="mt-2 flex gap-2">
                  <Button onClick={applyCandidate} size="sm" type="button">
                    Apply anyway
                  </Button>
                  <Button onClick={() => setConfirmingStale(false)} size="sm" type="button" variant="ghost">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <article aria-label="AI candidate" className="rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_4px_6px_rgba(0,0,0,0.05)]">
                <div className="flex flex-wrap items-center gap-2">
                  {candidate.valid ? (
                    <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#10B981]">
                      Valid Quiz Markdown
                    </span>
                  ) : (
                    <span className="rounded-full border border-[#EF4444]/30 bg-[#EF4444]/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#EF4444]">
                      Invalid — diagnostics below
                    </span>
                  )}
                </div>

                {!candidate.valid && candidate.diagnostics.length > 0 && (
                  <ul className="mt-2 space-y-1" aria-label="Candidate diagnostics">
                    {candidate.diagnostics.map((diagnostic, index) => (
                      <li className="text-[11px] leading-relaxed text-[#EF4444]" key={index}>
                        <span className="font-mono font-semibold">{diagnostic.code}</span>
                        {": "}
                        {diagnostic.message}
                        {diagnostic.questionNumber !== null
                          ? ` (question ${diagnostic.questionNumber}, line ${diagnostic.line}, column ${diagnostic.column})`
                          : ` (line ${diagnostic.line}, column ${diagnostic.column})`}
                      </li>
                    ))}
                  </ul>
                )}

                <details className="mt-2" open>
                  <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                    Candidate Markdown
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[#0F172A] p-3 font-mono text-[11px] leading-relaxed text-[#E2E8F0]">
                    {candidate.markdown}
                  </pre>
                </details>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={handleApplyClick} size="sm" type="button">
                    Apply to editor
                  </Button>
                  <Button onClick={handleDiscard} size="sm" type="button" variant="outline">
                    Discard
                  </Button>
                </div>
              </article>
            ))}

          {error !== null && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-xs font-medium text-[#EF4444]">
              <span>{error}</span>
              <Button onClick={handleRetry} size="sm" type="button" variant="destructive">
                Retry
              </Button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#64748B]" htmlFor={instructionId}>
              Instruction
            </label>
            <div className="flex items-end gap-2">
              <textarea
                className="min-h-[3rem] flex-1 resize-y rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-xs leading-relaxed text-[#0F172A] placeholder:text-[#64748B]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={inputsDisabled}
                id={instructionId}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="e.g. Add 5 multiple-choice questions about the uploaded document"
                rows={2}
                value={instruction}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button disabled={sendDisabled} onClick={handleSend} size="sm" type="button">
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
