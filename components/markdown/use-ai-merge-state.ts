"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeLineDiff } from "@/lib/quiz-markdown/diff";
import type { AiAuthorDiagnostic } from "@/lib/api/ai-authoring";
import type { AiMergeStatus } from "@/components/markdown/ai-merge-changes-card";

/**
 * AI change-set state machine for the authoring chat (Quizopia_System
 * #121, UX-04/UX-06).
 *
 * One ACTIVE change set at a time; history is kept per AI turn so the
 * conversation shows each turn's card with its final state. Safety rules:
 *
 * - A VALID candidate auto-applies as PENDING only when the editor still
 *   matches the source the request was issued against. Otherwise the change
 *   set enters CONFLICT and nothing is written to the editor.
 * - An INVALID candidate never auto-applies.
 * - `keepAll` seals the change set (status "kept") — it is an EDITOR
 *   operation, never database persistence.
 * - `undoAll` restores the pre-apply snapshot. If the teacher edited after
 *   the pending apply, the caller must confirm first (the card surfaces the
 *   confirmation; `force` performs the destructive restore).
 * - A new request while a change set is still pending is allowed (the
 *   teacher drives); the previous pending set is superseded: its pending
 *   apply stays in the editor (it becomes the baseline the new request is
 *   issued against) and its card flips to "kept" semantics via
 *   `supersedePending`.
 */

export interface AiChangeSet {
  readonly id: string;
  /** Editor source the request was issued against. */
  readonly sourceAtRequest: string;
  /** Editor source right before the pending apply (Undo target). */
  readonly preApplySnapshot: string | null;
  /** Candidate markdown from the assistant. */
  readonly markdown: string;
  readonly valid: boolean;
  readonly diagnostics: readonly AiAuthorDiagnostic[];
  readonly status: AiMergeStatus;
  /** Editor content the parent last wrote for this change set (apply point). */
  readonly appliedMarkdown: string | null;
}

let nextChangeSetId = 0;

export function useAiMergeState({
  onChange,
  value,
}: {
  /** Parent editor setter (writes the pending/kept/undone markdown). */
  readonly onChange: (value: string) => void;
  /** Current editor source (prop). */
  readonly value: string;
}) {
  const [changeSets, setChangeSets] = useState<AiChangeSet[]>([]);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const activeChangeSet = useMemo(
    () =>
      changeSets.find(
        (cs) => cs.status === "pending" || cs.status === "conflict",
      ) ?? null,
    [changeSets],
  );

  /** True when an unconfirmed pending change set exists (import gate). */
  const hasPendingChanges = activeChangeSet !== null;

  /**
   * Register an assistant result. Auto-applies ONLY when valid AND the
   * editor still matches the request source; otherwise conflict/invalid.
   */
  const registerResult = useCallback(
    (result: {
      readonly markdown: string;
      readonly valid: boolean;
      readonly diagnostics: readonly AiAuthorDiagnostic[];
      readonly sourceAtRequest: string;
    }): AiChangeSet => {
      const id = `cs-${nextChangeSetId += 1}`;
      const editorUnchanged = valueRef.current === result.sourceAtRequest;
      const canAutoApply = result.valid && editorUnchanged;

      const changeSet: AiChangeSet = {
        id,
        sourceAtRequest: result.sourceAtRequest,
        preApplySnapshot: canAutoApply ? valueRef.current : null,
        markdown: result.markdown,
        valid: result.valid,
        diagnostics: result.diagnostics,
        status: !result.valid ? "invalid" : canAutoApply ? "pending" : "conflict",
        appliedMarkdown: canAutoApply ? result.markdown : null,
      };

      if (canAutoApply) {
        onChange(result.markdown);
      }

      setChangeSets((prev) => [...prev, changeSet]);
      return changeSet;
    },
    [onChange],
  );

  /** Seal a pending/conflicted change set into the editor. */
  const keepAll = useCallback(
    (changeSetId: string) => {
      setChangeSets((prev) =>
        prev.map((cs) => {
          if (cs.id !== changeSetId || (cs.status !== "pending" && cs.status !== "conflict")) {
            return cs;
          }
          // Conflict: apply now (explicit user decision), snapshot first.
          if (cs.status === "conflict") {
            const snapshot = valueRef.current;
            onChange(cs.markdown);
            return {
              ...cs,
              status: "kept" as const,
              preApplySnapshot: snapshot,
              appliedMarkdown: cs.markdown,
            };
          }
          return { ...cs, status: "kept" as const };
        }),
      );
    },
    [onChange],
  );

  /**
   * Restore the pre-apply snapshot. `force` is required when the editor
   * deviates from the applied markdown (manual edits after apply).
   */
  const undoAll = useCallback(
    (changeSetId: string, force = false) => {
      setChangeSets((prev) => {
        const target = prev.find((cs) => cs.id === changeSetId);
        if (
          target === undefined ||
          (target.status !== "pending" && target.status !== "conflict")
        ) {
          return prev;
        }
        const manualEdits =
          target.appliedMarkdown !== null &&
          valueRef.current !== target.appliedMarkdown;
        if (manualEdits && !force) {
          // Caller must confirm; do nothing.
          return prev;
        }
        if (target.preApplySnapshot !== null) {
          onChange(target.preApplySnapshot);
        }
        return prev.map((cs) =>
          cs.id === changeSetId ? { ...cs, status: "undone" as const } : cs,
        );
      });
    },
    [onChange],
  );

  /** True when the editor deviates from this change set's applied markdown. */
  const hasManualEditsAfterApply = useCallback(
    (changeSetId: string): boolean => {
      const cs = changeSets.find((c) => c.id === changeSetId);
      if (cs === undefined || cs.appliedMarkdown === null) {
        return false;
      }
      return value !== cs.appliedMarkdown;
    },
    [changeSets, value],
  );

  /**
   * Diff counts for a change set (before = snapshot, after = candidate).
   * Memoized per change set: the inputs are immutable once the set is
   * registered, and cards re-render on every chat update — recomputing a
   * full-document diff per render made typing janky on large rewrites
   * (review P3).
   */
  const countsCacheRef = useRef(new Map<string, { added: number; deleted: number }>());
  const countsFor = useCallback(
    (changeSetId: string): { added: number; deleted: number } => {
      const cached = countsCacheRef.current.get(changeSetId);
      if (cached !== undefined) {
        return cached;
      }
      const cs = changeSets.find((c) => c.id === changeSetId);
      if (cs === undefined) {
        return { added: 0, deleted: 0 };
      }
      const before = cs.preApplySnapshot ?? cs.sourceAtRequest;
      const counts = computeLineDiff(before, cs.markdown).counts;
      countsCacheRef.current.set(changeSetId, counts);
      return counts;
    },
    [changeSets],
  );

  /** Flip a still-pending set to kept when a new request supersedes it. */
  const supersedePending = useCallback(() => {
    setChangeSets((prev) =>
      prev.map((cs) =>
        cs.status === "pending" || cs.status === "conflict"
          ? { ...cs, status: "kept" as const }
          : cs,
      ),
    );
  }, []);

  /** Drop all change sets (explicit reset). */
  const resetAll = useCallback(() => {
    setChangeSets([]);
  }, []);

  return {
    changeSets,
    activeChangeSet,
    hasPendingChanges,
    registerResult,
    keepAll,
    undoAll,
    hasManualEditsAfterApply,
    countsFor,
    supersedePending,
    resetAll,
  };
}
