"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForkAction } from "@/hooks/queries/use-community-fork";
import {
  classifyForkError,
  type ForkDraftResponse,
  type ForkErrorClassification,
} from "@/lib/api/community-fork";
import { Button } from "@/components/ui";
import { CommunityDialog } from "./CommunityDialog";

/**
 * "Fork this quiz" consent dialog (P3-B2-FE, issue #48 — ADR-006 §7/§8/§10).
 *
 * EXPLICIT CONSENT before any request: the dialog spells out what forking
 * does — an independent, editable DRAFT quiz + the recipient's OWN question
 * bank, a full copy of every question AND its correct answers, and preserved
 * attribution credit — and the confirm button stays disabled until the
 * teacher checks the acknowledgment.
 *
 * IDEMPOTENT ACTION (§10): one crypto-UUID `Idempotency-Key` per user action,
 * generated when the dialog opens, held across manual retries (network/429 —
 * the same key is what collapses a retry into the backend's idempotent 200),
 * and regenerated only for a genuinely NEW action (409 conflict, dialog
 * reopen, different publication). Double submits are disabled while in
 * flight. Nothing auto-loops: every retry is a user click.
 *
 * SUCCESS shows the attribution credit (sourceTitle + authorAlias) from the
 * fork response BEFORE navigation; "Open your draft" pushes the existing
 * teacher route `/exams/{targetExamId}`. The response's five fields are the
 * only thing consumed — no source answers/options ever exist client-side.
 */

/** The §7 public fields the dialog needs (nothing more exists client-side). */
export interface ForkPublicationTarget {
  publicationId: number;
  title: string;
  authorName: string;
}

/** Humanize a `Retry-After` wait for the 429 copy. */
function waitHint(seconds: number | null): string {
  if (seconds == null) return "please wait a moment and try again";
  if (seconds < 60) {
    return `wait about ${seconds} second${seconds === 1 ? "" : "s"} and try again`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again`;
}

export function ForkPublicationDialog({
  open,
  publication,
  onClose,
}: {
  open: boolean;
  publication: ForkPublicationTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  // One action per mounted dialog: the parent mounts this component only for
  // the fork session, so mount = action start = fresh key (§10), and every
  // retry of the session reuses it. No reset effects needed — unmount ends
  // the action, and the next open is a remount with a new key.
  const { mutation, startAction, submitFork } = useForkAction(
    publication.publicationId
  );
  const [consented, setConsented] = useState(false);
  const [failure, setFailure] = useState<ForkErrorClassification | null>(null);
  const [created, setCreated] = useState<ForkDraftResponse | null>(null);

  const busy = mutation.isPending;

  /** Closes the dialog — the parent unmounts it, ending the action/key. */
  const close = () => onClose();

  /** Fire (or re-fire) the CURRENT action — same key on every retry. */
  const onConfirm = async () => {
    setFailure(null);
    try {
      const draft = await submitFork(publication.publicationId);
      setCreated(draft);
    } catch (err) {
      setFailure(classifyForkError(err));
    }
  };

  /** 409 path — the burned key is dropped and a NEW action starts over. */
  const onStartNewAction = () => {
    setConsented(false);
    setFailure(null);
    setCreated(null);
    startAction(publication.publicationId);
  };

  /** Success follow-up — the action is complete; navigate to the draft. */
  const onOpenDraft = () => {
    if (!created) return;
    const href = `/exams/${created.targetExamId}`;
    onClose();
    router.push(href);
  };

  return (
    <CommunityDialog
      open={open}
      titleId="fork-publication-title"
      title={created ? "Your draft is ready" : "Fork this quiz"}
      description={
        created
          ? undefined
          : "Create your own independent copy of this community quiz."
      }
      onCancel={busy ? () => undefined : close}
      busy={busy}
    >
      {created ? (
        <div>
          <div
            role="status"
            className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/5 p-4"
          >
            <p className="text-sm font-medium text-[#0F172A]">
              Forked from{" "}
              <span className="font-semibold">“{created.sourceTitle}”</span> by{" "}
              <span className="font-semibold">{created.authorAlias}</span>
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              Credit for the original quiz stays attached to your draft.
            </p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#0F172A]">
            A new draft quiz and its own question bank were added to your
            account — every question and its correct answers were copied, fully
            editable. The original quiz is untouched.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 px-5"
              onClick={close}
            >
              Not now
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-11 px-5"
              data-autofocus
              onClick={onOpenDraft}
            >
              Open your draft
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <ul className="space-y-2.5 text-sm leading-relaxed text-[#0F172A]">
            <li className="flex gap-2.5">
              <Tick />
              <span>
                You&apos;ll get an{" "}
                <strong className="font-semibold">independent DRAFT quiz</strong>{" "}
                in your account. The original is never modified, and your copy
                won&apos;t receive the author&apos;s later changes.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Tick />
              <span>
                <strong className="font-semibold">
                  Every question and its correct answers
                </strong>{" "}
                are copied into your own question bank, ready to edit.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Tick />
              <span>
                <strong className="font-semibold">Credit is preserved</strong> —
                the original “{publication.title}” by {publication.authorName}{" "}
                stays attached to your draft.
              </span>
            </li>
          </ul>

          <label
            htmlFor="fork-consent"
            className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]/60 p-4 text-sm font-medium text-[#0F172A]"
          >
            <input
              id="fork-consent"
              type="checkbox"
              data-autofocus
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#0052FF]"
              checked={consented}
              disabled={busy}
              onChange={(e) => setConsented(e.target.checked)}
            />
            <span>
              I understand I&apos;m creating an independent, editable copy of
              this quiz in my account — including all of its questions and
              correct answers.
            </span>
          </label>

          {failure && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
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
              <span>
                {failure.kind === "network" &&
                  "Network error — check your connection and try again."}
                {failure.kind === "idempotencyConflict" &&
                  "This fork request was already used for a different quiz, so it wasn't repeated. Nothing was copied — start the fork again with a fresh request."}
                {failure.kind === "forkNotAllowed" &&
                  "Forking is no longer allowed for this quiz — the author may have changed its reuse settings. The quiz details were refreshed."}
                {failure.kind === "gone" && "This quiz is no longer available."}
                {failure.kind === "unauthenticated" &&
                  "Your session has expired — please sign in again."}
                {failure.kind === "rateLimited" &&
                  `Too many fork attempts — ${waitHint(failure.retryAfterSeconds)}.`}
                {failure.kind === "other" &&
                  "Couldn't create your draft. Please try again."}
                {(failure.kind === "network" ||
                  failure.kind === "rateLimited" ||
                  failure.kind === "other") && (
                  <button
                    type="button"
                    onClick={onConfirm}
                    className="ml-2 rounded font-semibold text-[#0052FF] underline outline-none hover:text-[#0043CC] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                  >
                    Try again
                  </button>
                )}
                {failure.kind === "idempotencyConflict" && (
                  <button
                    type="button"
                    onClick={onStartNewAction}
                    className="ml-2 rounded font-semibold text-[#0052FF] underline outline-none hover:text-[#0043CC] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
                  >
                    Start a new fork
                  </button>
                )}
              </span>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 px-5"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-11 px-5"
              disabled={!consented || busy}
              aria-busy={busy}
              onClick={onConfirm}
            >
              {busy ? (
                <>
                  <Spinner /> Forking…
                </>
              ) : (
                "Fork this quiz"
              )}
            </Button>
          </div>
        </div>
      )}
    </CommunityDialog>
  );
}

/** Emerald tick bullet for the consent list. */
function Tick() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

/** Accent inline spinner — same ring geometry as the page-level loader. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
    />
  );
}
