"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  classifyForkError,
  forkPublication,
  type ForkDraftResponse,
} from "@/lib/api/community-fork";

/**
 * Fork action state (P3, issue #48 — ADR-006 §7/§8/§10).
 *
 * KEY LIFECYCLE — one `Idempotency-Key` per USER ACTION (§10): a crypto UUID
 * generated when the action starts (dialog mount), held in component state so
 * it survives React re-renders, reused for EVERY retry of that action (manual
 * network-retry button — never an auto loop), and replaced only by a NEW
 * action (dialog reopen = remount, success navigation = unmount, a different
 * publication, or the 409 "start a new fork" path). A retry with the same key
 * is what makes the backend's §8 step 2 return the original 200 target
 * instead of a second copy; regenerating on retry would duplicate the fork.
 */

/** Generate a per-action `Idempotency-Key` (crypto UUID, 36 printable ASCII). */
export function generateForkIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC-4122 v4 fallback for non-secure contexts (crypto.randomUUID is
  // secure-context-only): same shape, still 36 printable ASCII chars.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * The raw POST mutation. Transport-only — the caller owns the key lifecycle
 * via {@link useForkAction}. Invalidation:
 * - success → `["exams"]`: a fresh DRAFT exam (+ bank) now exists; the
 *   teacher exam list / editor queries refetch so "Open your draft" never
 *   lands on a stale cache.
 * - 404 `gone` / 403 `forkNotAllowed` → `["community"]`: the source moved
 *   (hidden race, policy flip) — the public detail refetches and flips to
 *   its neutral state / updated `allowFork` (same posture as #46's 404).
 */
export function useForkPublicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { publicationId: number; idempotencyKey: string }) =>
      forkPublication(vars.publicationId, vars.idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      const { kind } = classifyForkError(error);
      if (kind === "gone" || kind === "forkNotAllowed") {
        queryClient.invalidateQueries({ queryKey: ["community"] });
      }
    },
  });
}

/** One live fork action: which publication, and the key protecting it. */
interface ForkAction {
  publicationId: number;
  idempotencyKey: string;
}

/**
 * Per-action fork state for the consent dialog (§10 key lifecycle).
 *
 * MOUNT = ACTION START: the hook is called by a dialog the parent mounts
 * only while its fork session is live (`{open && <Dialog/>}`), so the lazy
 * state initializer below generates the action's key exactly once per
 * dialog open — no reset effects, and a reopen is a remount is a NEW key.
 *
 * - {@link useForkAction.submitFork} — fire (or re-fire) the CURRENT action:
 *   the key is reused verbatim, which is what turns a manual network retry
 *   into the backend's idempotent 200 instead of a second fork. Two submits
 *   in the same tick read the SAME state value and send the SAME key.
 * - {@link useForkAction.startAction} — replace the action with a fresh key
 *   (the 409 "start a new fork" path: the burned key is never reused).
 * - A publication change mid-dialog defensively starts a new action too — a
 *   key is NEVER reused across targets (that is the 409 the backend throws).
 */
export function useForkAction(publicationId: number) {
  const mutation = useForkPublicationMutation();
  const [action, setAction] = useState<ForkAction>(() => ({
    publicationId,
    idempotencyKey: generateForkIdempotencyKey(),
  }));

  const startAction = useCallback((nextPublicationId: number) => {
    setAction({
      publicationId: nextPublicationId,
      idempotencyKey: generateForkIdempotencyKey(),
    });
  }, []);

  const submitFork = useCallback(
    (targetPublicationId: number): Promise<ForkDraftResponse> => {
      const current =
        action.publicationId === targetPublicationId
          ? action
          : {
              publicationId: targetPublicationId,
              idempotencyKey: generateForkIdempotencyKey(),
            };
      if (current !== action) setAction(current);
      return mutation.mutateAsync({
        publicationId: current.publicationId,
        idempotencyKey: current.idempotencyKey,
      });
    },
    [action, mutation]
  );

  return {
    /** TanStack mutation state (`isPending`, `error`, …). */
    mutation,
    /** The live action's key (assertable in tests). */
    idempotencyKey: action.idempotencyKey,
    startAction,
    submitFork,
  };
}

