"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useCommunityPublicationQuery } from "@/hooks/queries/use-community";
import {
  usePublicationSavedQuery,
  useRemoveBookmarkMutation,
  useSaveBookmarkMutation,
} from "@/hooks/queries/use-community-bookmarks";
import { useAuth } from "@/hooks/useAuth";
import { ForkPublicationDialog } from "@/components/community/ForkPublicationDialog";
import { describeBookmarkError } from "@/components/community/community-errors";
import { Badge, Button, Card, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { buildLoginRedirect } from "@/lib/auth/redirect";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Public Community quiz detail (P3-A-FE1, issue #43 — ADR-006 §7/§10).
 *
 * Anonymous, safe-by-construction: renders ONLY the `PublicPublicationDetail`
 * allowlist (title, alias credit, category, tags, counts, duration, dates) as
 * React text — no question/option/answer content, no exam ids, no PII exist in
 * the consumed type, and nothing is ever rendered as HTML/markdown.
 *
 * A 404 (absent, unpublished, hidden or archived source) renders a neutral
 * not-available state — the §7 anti-enumeration posture gives no reason why.
 *
 * Save CTA (#46): guests get the "Sign in to save" link carrying `returnTo`
 * (also what SSR/first paint renders while auth status resolves — no wrong
 * state flash); signed-in STUDENT/TEACHER users get the explicit-loading
 * Save/Remove toggle backed by the idempotent PUT/DELETE (no optimistic
 * updates). A 404 mid-save surfaces "no longer available" copy and the
 * mutation invalidates the whole community tree so this page refetches into
 * the neutral not-available state.
 *
 * Fork CTA (#48, ADR-006 §7/§10): rendered ONLY when `allowFork` is true
 * (NO_FORK publications ship no fork UI at all). Guests get the login CTA
 * carrying the same `returnTo`; STUDENT gets an explanatory
 * "requires a teacher account" state (non-actionable); TEACHER opens the
 * consent dialog in ForkPublicationDialog, which owns the per-action
 * `Idempotency-Key` lifecycle, the 200/201/403/409/429/404 handling and the
 * `/exams/{targetExamId}` navigation.
 */

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PublicationDetailPage() {
  const { publicationId } = useParams<{ publicationId: string }>();
  const id = Number(publicationId);
  const validId = Number.isInteger(id) && id > 0;
  const { status, user } = useAuth();
  const authenticated = status === "authenticated";
  // §7 auth matrix: only TEACHER-role callers may fork (dual-role users
  // qualify); STUDENT sees the explanatory non-actionable state.
  const isTeacher = (user?.roles ?? []).includes("TEACHER");
  const { saved, isPending: savedPending } = usePublicationSavedQuery(
    id,
    authenticated && validId
  );
  const saveMut = useSaveBookmarkMutation();
  const removeMut = useRemoveBookmarkMutation();
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  // Fork dialog (#48) — one session from button click to dialog close; it
  // stays mounted while open even if a refetch flips `allowFork`, so a 403
  // explanation is never yanked away mid-read.
  const [forkOpen, setForkOpen] = useState(false);

  const busy = saveMut.isPending || removeMut.isPending;

  const onSave = async () => {
    setNotice(null);
    try {
      await saveMut.mutateAsync(id);
      setNotice({ kind: "success", message: "Saved to your collection." });
    } catch (err) {
      setNotice({ kind: "error", message: describeBookmarkError(err) });
    }
  };

  const onRemove = async () => {
    setNotice(null);
    try {
      await removeMut.mutateAsync(id);
      setNotice({ kind: "success", message: "Removed from your collection." });
    } catch (err) {
      setNotice({ kind: "error", message: describeBookmarkError(err) });
    }
  }

  const { data, isPending, isError, error } = useCommunityPublicationQuery(
    id,
    validId
  );
  const normalized = error as unknown as NormalizedApiError | undefined;
  const notFound =
    normalized?.kind === "api" &&
    (normalized.status === 404 || normalized.code === "COMMUNITY_NOT_FOUND");

  // `returnTo` preserves this exact URL across the login round-trip.
  const loginHref = buildLoginRedirect(`/community/quizzes/${publicationId}`, "");

  if (!validId) {
    return <NotAvailable />;
  }
  if (isPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading community quiz"
        className="space-y-4 py-2"
      >
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-[#F1F5F9]" />
        <div className="h-4 w-1/3 animate-pulse rounded-lg bg-[#F1F5F9]" />
        <div className="h-40 animate-pulse rounded-xl bg-[#F1F5F9]" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (isError) {
    if (notFound) {
      return <NotAvailable />;
    }
    const message =
      normalized?.kind === "network"
        ? "Network error — check your connection and try again."
        : "Couldn't load this quiz. Please try again.";
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]"
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
        <span>{message}</span>
      </div>
    );
  }
  if (!data) {
    return <NotAvailable />;
  }

  return (
    <div>
      <Link
        href="/community"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-[#64748B] outline-none transition-colors hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to community
      </Link>

      <Card variant="elevated" className="mt-4 p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{data.categoryTitle ?? "Uncategorised"}</Badge>
          {data.allowFork && <Badge>Forkable</Badge>}
        </div>
        <h1 className="mt-4 font-display text-3xl tracking-tight text-[#0F172A]">
          {data.title}
        </h1>
        <p className="mt-2 text-sm font-medium text-[#64748B]">
          by <span className="font-semibold text-[#0F172A]">{data.authorName}</span>
          {" · "}Published {formatDate(data.publishedAt)}
          {" · "}Updated {formatDate(data.updatedAt)}
        </p>
        {data.summary && (
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#0F172A]">
            {data.summary}
          </p>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]/60 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Questions
            </dt>
            <dd className="mt-1 font-display text-2xl text-[#0F172A]">
              {data.questionCount}
            </dd>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]/60 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Sections
            </dt>
            <dd className="mt-1 font-display text-2xl text-[#0F172A]">
              {data.sectionCount}
            </dd>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]/60 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Duration
            </dt>
            <dd className="mt-1 font-display text-2xl text-[#0F172A]">
              {data.durationMinutes} min
            </dd>
          </div>
        </dl>

        {data.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}

        {/* Save panel (#46): guests → login CTA with returnTo; signed-in
            users → explicit-loading idempotent Save/Remove toggle. */}
        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-[#0052FF]/20 bg-[#0052FF]/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[#0F172A]">
              Save this quiz to your personal collection to find it later.
            </p>
            {authenticated ? (
              <Button
                type="button"
                variant={saved ? "outline" : "primary"}
                size="sm"
                className="h-11 shrink-0"
                disabled={busy || savedPending}
                aria-busy={busy || savedPending}
                onClick={saved ? onRemove : onSave}
              >
                {busy || savedPending ? <Spinner /> : null}
                {savedPending
                  ? "Checking…"
                  : saveMut.isPending
                    ? "Saving…"
                    : removeMut.isPending
                      ? "Removing…"
                      : saved
                        ? "Remove from saved"
                        : "Save to my collection"}
              </Button>
            ) : (
              <Link
                href={loginHref}
                data-testid="sign-in-to-save"
                className={cn(buttonVariants({ variant: "primary", size: "sm" }), "h-11 shrink-0")}
              >
                Sign in to save
              </Link>
            )}
          </div>
          {notice && (
            <p
              role={notice.kind === "success" ? "status" : "alert"}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                notice.kind === "success"
                  ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#0F172A]"
                  : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
              )}
            >
              {notice.message}
            </p>
          )}
        </div>

        {/* Fork panel (#48): rendered ONLY while `allowFork` is true — a
            NO_FORK publication ships no fork UI at all. Guests get the
            login CTA (same `returnTo` continuation as save); STUDENT gets
            the explanatory non-actionable state; TEACHER opens the consent
            dialog. */}
        {data.allowFork && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#10B981]/25 bg-[#10B981]/5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-[#0F172A]">
                Make it yours — fork an independent, editable draft with every
                question and its correct answers.
              </p>
              {authenticated ? (
                isTeacher ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-11 shrink-0"
                    onClick={() => setForkOpen(true)}
                  >
                    Fork this quiz
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#64748B]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                    Requires a teacher account
                  </span>
                )
              ) : (
                <Link
                  href={loginHref}
                  data-testid="sign-in-to-fork"
                  className={cn(buttonVariants({ variant: "primary", size: "sm" }), "h-11 shrink-0")}
                >
                  Sign in to fork
                </Link>
              )}
            </div>
            {authenticated && !isTeacher && (
              <p className="text-xs leading-relaxed text-[#64748B]">
                Only teacher accounts can fork quizzes into their own drafts.
                You can still save this quiz to your collection above.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Mounted for the whole dialog session (see `forkOpen`) — the source
          data may refetch underneath it after a 403/404 (#48). */}
      {forkOpen && data && (
        <ForkPublicationDialog
          open
          publication={{
            publicationId: data.publicationId,
            title: data.title,
            authorName: data.authorName,
          }}
          onClose={() => setForkOpen(false)}
        />
      )}
    </div>
  );
}

/** Neutral 404 state — no reason string (§7 anti-enumeration). */
function NotAvailable() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 py-20 text-center shadow-[0_4px_6px_rgba(0,0,0,0.07)]">
      <p className="font-display text-lg font-bold text-[#0F172A]">
        This quiz isn&apos;t available
      </p>
      <p className="mt-1 text-sm text-[#64748B]">
        It may have been unpublished or removed by its author.
      </p>
      <Link
        href="/community"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5 h-11")}
      >
        Browse the community
      </Link>
    </div>
  );
}

/** Accent inline spinner — same ring geometry as the auth loader, button-sized. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
    />
  );
}
