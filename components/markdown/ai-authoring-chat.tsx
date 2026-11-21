"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { cn } from "@/lib/utils/cn";
import type {
  AiAuthorMessage,
  AiAuthorRequest,
  AiAuthorResponse,
} from "@/lib/api/ai-authoring";
import type { NormalizedApiError } from "@/lib/api";
import {
  useAiAuthoringStatusQuery,
  useAuthorAiMarkdownMutation,
  useExtractAiDocumentMutation,
} from "@/hooks/queries/use-ai-authoring";
import { AiPromptComposer } from "./ai-prompt-composer";
import {
  AiSourcesManager,
  type AiSourceItem,
} from "./ai-sources-manager";
import { AiMergeChangesCard } from "./ai-merge-changes-card";
import { AiDiffViewer } from "./ai-diff-viewer";
import { useAiMergeState } from "./use-ai-merge-state";

/** Mirrors the backend extraction cap — pre-checked client-side. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Prior chat turns sent back with each author request (most recent last). */
const HISTORY_LIMIT = 20;
/** Mirrors backend `quizopia.ai.authoring.max-documents`. */
const MAX_DOCUMENTS = 5;
/** Mirrors backend `quizopia.ai.authoring.max-total-document-chars`. */
const MAX_TOTAL_DOCUMENT_CHARS = 100_000;

/** One conversation entry: user turn, assistant turn, or inline error. */
type ChatEntry =
  | { readonly kind: "user"; readonly id: string; readonly text: string }
  | { readonly kind: "assistant"; readonly id: string; readonly text: string; readonly changeSetId: string | null }
  | {
      readonly kind: "error";
      readonly id: string;
      readonly message: string;
      readonly retryable: "retry" | "login" | "none";
      /** Request to re-issue on retry (never duplicates the user turn). */
      readonly request: AiAuthorRequest | null;
    };

let nextEntryId = 0;

function describeError(err: unknown): {
  message: string;
  retryable: "retry" | "login" | "none";
} {
  const norm = err as NormalizedApiError | undefined;
  if (norm?.kind === "api" || norm?.kind === "http") {
    if (norm.status === 401) {
      return {
        message: "Your session expired — sign in again to continue.",
        retryable: "login",
      };
    }
    if (norm.status === 403) {
      return {
        message: "AI Assistant is not available for this question bank.",
        retryable: "none",
      };
    }
    if (norm.status === 429) {
      return {
        message: "The AI service is busy — wait a moment and try again.",
        retryable: "retry",
      };
    }
    if (norm.status >= 500) {
      return {
        message: "The AI service failed to process the request. Try again.",
        retryable: "retry",
      };
    }
    return {
      message: norm.message || `Request failed (HTTP ${norm.status}).`,
      retryable: "retry",
    };
  }
  if (norm?.kind === "network") {
    return {
      message: "Network error — check your connection and try again.",
      retryable: "retry",
    };
  }
  return { message: "Something went wrong. Please try again.", retryable: "retry" };
}

/**
 * AI Assistant chat for the Quiz Markdown authoring pane.
 *
 * Session-only client state (no persistence): uploaded documents, the chat
 * log, and per-turn change sets. Every turn sends the CURRENT editor
 * Markdown; each change set remembers the source it was authored against so
 * a stale apply can never silently overwrite editor edits. Availability
 * comes from the server probe — any error is "unavailable" and nothing
 * about server keys/configuration is ever rendered.
 */
export function AiAuthoringChat({
  bankId,
  onChange,
  onPendingChangesChange,
  value,
}: {
  readonly bankId: number;
  readonly onChange: (value: string) => void;
  /** Notifies the host when unconfirmed pending AI changes exist (import gate). */
  readonly onPendingChangesChange?: (pending: boolean) => void;
  readonly value: string;
}) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [instruction, setInstruction] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceItems, setSourceItems] = useState<AiSourceItem[]>([]);
  const [reviewChangeSetId, setReviewChangeSetId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [sendLock, setSendLock] = useState(false);

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Latest editor source (updated post-commit, not during render) + last
  // issued request (for Retry).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const lastRequestRef = useRef<{ request: AiAuthorRequest; sourceAtRequest: string } | null>(null);

  const statusQuery = useAiAuthoringStatusQuery(bankId);
  const extractMutation = useExtractAiDocumentMutation(bankId);
  const authorMutation = useAuthorAiMarkdownMutation(bankId);

  const merge = useAiMergeState({ onChange, value });

  useEffect(() => {
    onPendingChangesChange?.(merge.hasPendingChanges);
  }, [merge.hasPendingChanges, onPendingChangesChange]);

  const loading = statusQuery.isPending;
  // Any probe error (incl. 403 for non-owners) counts as unavailable.
  const unavailable = statusQuery.isError || statusQuery.data?.available === false;
  const inputsDisabled = loading || unavailable;
  const pending = authorMutation.isPending;
  const uploading = uploadingFiles || extractMutation.isPending;

  const selectedSources = sourceItems.filter(
    (item) => item.selected && item.document !== null,
  );
  const selectedChars = selectedSources.reduce(
    (sum, item) => sum + (item.document?.charCount ?? 0),
    0,
  );
  const overBudget =
    selectedSources.length > MAX_DOCUMENTS || selectedChars > MAX_TOTAL_DOCUMENT_CHARS;

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries, pending]);

  const handleAuthorSuccess = useCallback(
    (response: AiAuthorResponse, sourceAtRequest: string) => {
      const changeSet = merge.registerResult({
        markdown: response.markdown,
        valid: response.valid,
        diagnostics: response.diagnostics,
        sourceAtRequest,
      });
      setEntries((prev) => [
        ...prev,
        {
          kind: "assistant",
          id: `e-${nextEntryId += 1}`,
          text: response.reply,
          changeSetId: changeSet.id,
        },
      ]);
    },
    [merge],
  );

  const issueRequest = useCallback(
    (request: AiAuthorRequest, sourceAtRequest: string) => {
      lastRequestRef.current = { request, sourceAtRequest };
      authorMutation.mutate(request, {
        onSuccess: (response) => handleAuthorSuccess(response, sourceAtRequest),
        onError: (err) => {
          const described = describeError(err);
          setEntries((prev) => [
            ...prev,
            {
              kind: "error",
              id: `e-${nextEntryId += 1}`,
              message: described.message,
              retryable: described.retryable,
              request: described.retryable === "retry" ? request : null,
            },
          ]);
        },
      });
    },
    [authorMutation, handleAuthorSuccess],
  );

  const handleSend = useCallback(() => {
    const trimmed = instruction.trim();
    if (
      trimmed.length === 0 ||
      inputsDisabled ||
      pending ||
      sendLock ||
      overBudget ||
      // P1-1 (gate review round 3): an unconfirmed change set must be
      // resolved with an explicit Keep all / Undo all BEFORE the next
      // request. Sending used to silently flip pending/conflict sets to
      // "kept" — a failed follow-up then left unintended changes accepted
      // and importable. The composer stays blocked until the decision.
      merge.hasPendingChanges
    ) {
      return;
    }
    // Duplicate-submission guard: lock synchronously for the whole commit.
    setSendLock(true);
    try {
      const sourceAtRequest = valueRef.current;
      const history: AiAuthorMessage[] = entries
        .filter((e): e is Extract<ChatEntry, { kind: "user" | "assistant" }> =>
          e.kind === "user" || e.kind === "assistant",
        )
        .slice(-HISTORY_LIMIT)
        .map((e) => ({
          role: e.kind === "user" ? "user" : "assistant",
          content: e.text,
        }));
      // The user turn is appended immediately and STAYS even when the
      // request fails (Retry re-issues the same request without duplicating it).
      setEntries((prev) => [
        ...prev,
        { kind: "user", id: `e-${nextEntryId += 1}`, text: trimmed },
      ]);
      setInstruction("");
      issueRequest(
        {
          instruction: trimmed,
          currentMarkdown: sourceAtRequest,
          documents: selectedSources.map((item) => ({
            name: item.document!.name,
            text: item.document!.text,
          })),
          history,
        },
        sourceAtRequest,
      );
    } finally {
      setSendLock(false);
    }
  }, [
    entries,
    inputsDisabled,
    instruction,
    issueRequest,
    merge.hasPendingChanges,
    overBudget,
    pending,
    selectedSources,
    sendLock,
  ]);

  const handleRetry = useCallback(
    (request: AiAuthorRequest) => {
      if (pending || merge.hasPendingChanges) {
        return;
      }
      // Replace the error entry instead of stacking a new one. The retried
      // request keeps ITS OWN baseline (currentMarkdown it was authored
      // against) — reusing the latest request's sourceAtRequest would let a
      // stale retry auto-apply against a newer baseline and silently
      // overwrite a later kept change set (review P2). Retry is ALSO blocked
      // while a change set is unreviewed, exactly like sending (gate review
      // round 3 re-review P2: a retry could otherwise stack a second active
      // change set on top of an unresolved one).
      setEntries((prev) => prev.filter((e) => !(e.kind === "error" && e.request === request)));
      issueRequest(request, request.currentMarkdown);
    },
    [issueRequest, merge.hasPendingChanges, pending],
  );

  /**
   * Multi-file upload: one mutateAsync per file, awaited via allSettled so
   * EVERY document lands (TanStack per-mutate callbacks can be dropped for
   * superseded calls on the same observer — gate review P2). Results append
   * in selection order; failures become per-source error rows in the
   * manager, never full-width banners.
   */
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    const accepted = files.filter((file) => file.size <= MAX_UPLOAD_BYTES);
    const rejected = files.filter((file) => file.size > MAX_UPLOAD_BYTES);

    const pendingItems: AiSourceItem[] = [
      ...rejected.map((file) => ({
        id: `src-${nextEntryId += 1}`,
        name: file.name,
        document: null,
        status: "error" as const,
        error: `${file.name} is larger than 5 MiB — extract a smaller file.`,
        selected: false,
      })),
      ...accepted.map((file) => ({
        id: `src-${nextEntryId += 1}`,
        name: file.name,
        document: null,
        status: "loading" as const,
        error: null,
        selected: false,
      })),
    ];
    setSourceItems((prev) => [...prev, ...pendingItems]);

    if (accepted.length === 0) {
      return;
    }
    setUploadingFiles(true);
    try {
      const settled = await Promise.allSettled(
        accepted.map((file) => extractMutation.mutateAsync(file)),
      );
      setSourceItems((prev) => {
        const updated = [...prev];
        let acceptIndex = 0;
        // Budget-aware auto-attach: count already-attached docs first so a
        // multi-file upload never auto-selects beyond the backend caps.
        let attached = prev.filter((i) => i.selected && i.document !== null).length;
        let attachedChars = prev.reduce(
          (sum, i) => sum + (i.selected ? (i.document?.charCount ?? 0) : 0),
          0,
        );
        for (let i = 0; i < updated.length; i += 1) {
          const item = updated[i];
          if (item.status !== "loading") {
            continue;
          }
          const result = settled[acceptIndex];
          acceptIndex += 1;
          if (result === undefined) {
            continue;
          }
          if (result.status === "fulfilled") {
            const withinBudget =
              attached + 1 <= MAX_DOCUMENTS &&
              attachedChars + result.value.charCount <= MAX_TOTAL_DOCUMENT_CHARS;
            if (withinBudget) {
              attached += 1;
              attachedChars += result.value.charCount;
            }
            updated[i] = {
              ...item,
              document: result.value,
              status: "ready",
              selected: withinBudget,
            };
          } else {
            const described = describeError(result.reason);
            updated[i] = {
              ...item,
              status: "error",
              error: described.message,
            };
          }
        }
        return updated;
      });
    } finally {
      setUploadingFiles(false);
    }
  };

  const reviewChangeSet = merge.changeSets.find(
    (cs) => cs.id === reviewChangeSetId,
  );

  return (
    <section aria-label="AI Assistant" className="relative flex h-full min-h-0 flex-col gap-3">
      {/* Screen-reader announcements for pending / error / success. */}
      <p aria-live="polite" className="sr-only">
        {pending
          ? "The assistant is working on your request."
          : merge.hasPendingChanges
            ? "The assistant proposed changes — review, keep, or undo them."
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
          <input
            ref={fileInputRef}
            accept=".txt,.pdf,.docx,.pptx"
            aria-label="Upload document (file input)"
            className="sr-only"
            disabled={inputsDisabled}
            id={fileInputId}
            multiple
            onChange={handleFileChange}
            type="file"
          />

          <div
            aria-label="AI conversation"
            className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_4px_6px_rgba(0,0,0,0.05)]"
            ref={chatScrollRef}
          >
            {entries.length === 0 && !pending && (
              <p className="px-1 py-6 text-center text-xs leading-relaxed text-[#64748B]">
                Ask the AI to draft or rework questions, e.g. &ldquo;Add 5 multiple-choice
                questions about the uploaded document.&rdquo;
              </p>
            )}
            {entries.map((entry) => {
              if (entry.kind === "user") {
                return (
                  <div
                    className="ml-auto max-w-[90%] rounded-xl bg-[#0052FF]/10 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-[#0F172A]"
                    key={entry.id}
                  >
                    <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
                      You
                    </span>
                    {entry.text}
                  </div>
                );
              }
              if (entry.kind === "assistant") {
                const changeSet =
                  entry.changeSetId === null
                    ? null
                    : merge.changeSets.find((cs) => cs.id === entry.changeSetId) ?? null;
                return (
                  <div key={entry.id} className="max-w-[95%] space-y-2">
                    <div className="rounded-xl bg-[#F1F5F9] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-[#0F172A]">
                      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
                        Assistant
                      </span>
                      {entry.text}
                    </div>
                    {changeSet !== null && (
                      <AiMergeChangesCard
                        changeSetId={changeSet.id}
                        counts={merge.countsFor(changeSet.id)}
                        diagnostics={changeSet.diagnostics}
                        invalid={!changeSet.valid}
                        manualEditsAfterApply={merge.hasManualEditsAfterApply(changeSet.id)}
                        preservation={changeSet.preservation}
                        onKeepAll={merge.keepAll}
                        onReview={setReviewChangeSetId}
                        onUndoAll={(id) => merge.undoAll(id, true)}
                        status={changeSet.status}
                      />
                    )}
                  </div>
                );
              }
              // Inline error row tied to the failed turn.
              return (
                <div
                  className="flex max-w-[95%] flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 text-xs leading-relaxed text-[#EF4444]"
                  key={entry.id}
                  role="alert"
                >
                  <span>{entry.message}</span>
                  {entry.retryable === "retry" && entry.request !== null && (
                    <button
                      className="rounded-sm px-0.5 text-[11px] font-semibold underline decoration-dotted underline-offset-2 transition-colors hover:text-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]"
                      onClick={() => handleRetry(entry.request!)}
                      type="button"
                    >
                      Retry
                    </button>
                  )}
                  {entry.retryable === "login" && (
                    <a
                      className="rounded-sm px-0.5 text-[11px] font-semibold underline decoration-dotted underline-offset-2 hover:text-[#B91C1C]"
                      href="/login"
                    >
                      Sign in
                    </a>
                  )}
                </div>
              );
            })}
            {pending && (
              <div
                aria-live="polite"
                className="max-w-[90%] rounded-xl bg-[#F1F5F9] px-3 py-2 text-xs font-medium text-[#64748B]"
              >
                Assistant is thinking…
              </div>
            )}
          </div>

          {overBudget && (
            <p
              className={cn(
                "rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-2.5 text-[11px] font-medium leading-relaxed text-[#EF4444]",
              )}
              role="alert"
            >
              {selectedSources.length} sources selected but at most {MAX_DOCUMENTS} can be
              sent per request ({selectedChars.toLocaleString()} /{" "}
              {MAX_TOTAL_DOCUMENT_CHARS.toLocaleString()} chars) — open Sources and detach
              some before sending.
            </p>
          )}

          {merge.hasPendingChanges && !pending && (
            <p
              className="px-1 text-[11px] font-medium leading-relaxed text-[#92400E]"
              role="status"
            >
              Review the proposed changes first — Keep all or Undo all to continue
              (sending is paused until you decide).
            </p>
          )}

          <AiPromptComposer
            disabled={inputsDisabled}
            onChange={setInstruction}
            onSend={handleSend}
            onSourcesClick={() => setSourcesOpen(true)}
            onUploadClick={() => fileInputRef.current?.click()}
            pending={pending || overBudget || merge.hasPendingChanges}
            sourcesCount={sourceItems.length}
            uploadDisabled={inputsDisabled}
            value={instruction}
          />
        </>
      )}

      <AiSourcesManager
        items={sourceItems}
        maxDocuments={MAX_DOCUMENTS}
        maxTotalChars={MAX_TOTAL_DOCUMENT_CHARS}
        onDismiss={() => setSourcesOpen(false)}
        onRemove={(id) => setSourceItems((prev) => prev.filter((i) => i.id !== id))}
        onSelectToggle={(id) =>
          setSourceItems((prev) => {
            const target = prev.find((i) => i.id === id);
            if (target === undefined) {
              return prev;
            }
            if (!target.selected) {
              // Enforce the backend budget at selection time: refuse to
              // attach beyond max documents or max total chars (the send
              // path double-checks; this keeps the counter honest early).
              const selectedDocs = prev.filter(
                (i) => i.selected && i.document !== null,
              );
              const count = selectedDocs.length + 1;
              const chars =
                selectedDocs.reduce(
                  (sum, i) => sum + (i.document?.charCount ?? 0),
                  0,
                ) + (target.document?.charCount ?? 0);
              if (count > MAX_DOCUMENTS || chars > MAX_TOTAL_DOCUMENT_CHARS) {
                return prev;
              }
            }
            return prev.map((i) =>
              i.id === id ? { ...i, selected: !i.selected } : i,
            );
          })
        }
        onUploadClick={() => fileInputRef.current?.click()}
        open={sourcesOpen}
        uploading={uploading}
      />

      {reviewChangeSet !== undefined && (
        <AiDiffViewer
          before={reviewChangeSet.preApplySnapshot ?? reviewChangeSet.sourceAtRequest}
          after={reviewChangeSet.markdown}
          keepDisabled={!reviewChangeSet.valid}
          undoDisabled={merge.hasManualEditsAfterApply(reviewChangeSet.id)}
          onDismiss={() => setReviewChangeSetId(null)}
          onKeepAll={() => {
            merge.keepAll(reviewChangeSet.id);
            setReviewChangeSetId(null);
          }}
          onUndoAll={() => {
            // Manual edits after the pending apply: the inline card demands
            // an explicit destructive-restore confirmation; the dialog simply
            // refuses and points there (review P2 — no silent data loss).
            if (merge.hasManualEditsAfterApply(reviewChangeSet.id)) {
              setReviewChangeSetId(null);
              return;
            }
            merge.undoAll(reviewChangeSet.id, true);
            setReviewChangeSetId(null);
          }}
          open
        />
      )}
    </section>
  );
}
