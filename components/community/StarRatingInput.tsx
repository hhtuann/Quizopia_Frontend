"use client";

import { useRef, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { waitHint } from "./community-errors";
import { classifySocialError } from "@/lib/api/community-social";
import {
  useDeleteRatingMutation,
  usePutRatingMutation,
  useSocialSummaryQuery,
} from "@/hooks/queries/use-community-social";

/**
 * Accessible 1–5 star rating selector (P3-C4, issue #68 — ADR-007 §7).
 * Replaces #67's `RATE_DIALOG_SEAM` inside the toolbar's rate dialog.
 *
 * This file is also the shared home of the star ATOMS the toolbar reuses
 * (`StarIcon`, `formatAverage`) — it must not import the toolbar back
 * (the toolbar renders this component; that would be a cycle).
 *
 * A11Y — WAI-ARIA radiogroup pattern: a fieldset/legend-wrapped
 * `role="radiogroup"` of five `role="radio"` buttons ("1 star"…"5 stars")
 * with roving tabindex and arrow-key operation (ArrowRight/Down and
 * ArrowLeft/Up move — clamped at 1★/5★, never wrap; Home/End jump). Per
 * the APG, moving with the arrows
 * also CHECKS the focused radio — here selection submits immediately (the
 * §5 rating PUT is an idempotent upsert, so every selection is "the update
 * path").
 *
 * Publisher self-rating: the §5 PUT answers 409
 * `COMMUNITY_SELF_RATING_NOT_ALLOWED` — rendered as the informative state
 * ("You cannot rate your own quiz.") instead of the controls.
 */

/** Icon-only presentation details shared by the star glyphs. */
function iconProps(filled = false) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    strokeWidth: filled ? 0 : 1.8,
    stroke: filled ? "none" : "currentColor",
    fill: filled ? "currentColor" : "none",
    className: "h-4 w-4 shrink-0",
    "aria-hidden": true,
  } as const;
}

/** Star glyph — the toolbar's action chip and the radiogroup share it. */
export function StarIcon({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg {...iconProps(filled)} className={cn(iconProps(filled).className, className)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </svg>
  );
}

/**
 * §7 aggregate formatting — 2 decimals with trailing zeros trimmed
 * (`4.58 → "4.58"`, `4.6 → "4.6"`, `4 → "4"`), `—` when `null`
 * (zero ratings).
 */
export function formatAverage(average: number | null): string {
  if (average == null || !Number.isFinite(average)) return "—";
  const trimmed = average.toFixed(2).replace(/\.?0+$/, "");
  return trimmed === "" ? "0" : trimmed;
}

// `waitHint` is imported from ./community-errors — the shared #67 helper
// for every 429 copy (consumed by describeRatingError below).

/**
 * Rating-action copy — the social classifier (lib single source) mapped to
 * the selector's failure surface. The publisher 409 carries the frozen
 * informative copy.
 */
export function describeRatingError(err: unknown): string {
  const { kind, retryAfterSeconds } = classifySocialError(err);
  switch (kind) {
    case "selfRating":
      return "You cannot rate your own quiz.";
    case "gone":
      return "This quiz is no longer available.";
    case "unauthenticated":
      return "Your session has expired — please sign in again.";
    case "rateLimited":
      return `Too many requests — ${waitHint(retryAfterSeconds)}.`;
    case "network":
      return "Network error — check your connection and try again.";
    default:
      return "Couldn't save your rating. Please try again.";
  }
}

/** Accent inline spinner — same ring geometry as the auth loader. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/** Accessible radiogroup: roving tabindex, arrows/Home/End check + submit (arrows clamp at the ends). */
function StarRadioGroup({
  value,
  busy,
  onSelect,
}: {
  /** Own rating (checked radio), `null` when unrated. */
  value: number | null;
  busy: boolean;
  onSelect: (rating: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Roving tabindex home: the checked radio when one exists, else the last
  // arrow-visited radio (starts at "1 star").
  const [focusIndex, setFocusIndex] = useState(0);
  const activeIndex = value != null ? value - 1 : focusIndex;

  const move = (index: number) => {
    setFocusIndex(index);
    refs.current[index]?.focus();
    if (!busy) onSelect(index + 1);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      aria-busy={busy}
      data-testid="star-radiogroup"
      className="flex items-center gap-1"
    >
      {STAR_VALUES.map((n, i) => {
        const checked = value === n;
        return (
          <button
            key={n}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            aria-disabled={busy}
            tabIndex={i === activeIndex ? 0 : -1}
            data-testid={`star-${n}`}
            onClick={() => {
              setFocusIndex(i);
              if (!busy) onSelect(n);
            }}
            onKeyDown={(e) => {
              let next: number | null = null;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                // CLAMPED at the top end — a wrap from 5★ to 1★ would
                // downgrade the rating on a single keypress.
                next = Math.min(i + 1, STAR_VALUES.length - 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                next = Math.max(i - 1, 0);
              } else if (e.key === "Home") {
                next = 0;
              } else if (e.key === "End") {
                next = STAR_VALUES.length - 1;
              }
              if (next == null) return;
              e.preventDefault();
              // At a boundary the press is consumed silently: focus stays
              // put and the current value is NOT re-submitted.
              if (next !== i) move(next);
            }}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-lg outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
              checked ? "text-[#F59E0B]" : "text-[#94A3B8] hover:text-[#F59E0B]"
            )}
          >
            <StarIcon filled={checked} className="h-6 w-6" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The rate-dialog body: live aggregate (average + count, guest-safe `—`),
 * own rating, submit-on-selection radiogroup and Clear (§5 DELETE), with the
 * publisher self-rating 409 as an informative state.
 */
export function StarRatingInput({ publicationId }: { publicationId: number }) {
  // Shares the toolbar's cache entry (`["community","social",id]`) — no extra
  // request beyond the normal observer-driven refetch.
  const summary = useSocialSummaryQuery(publicationId, true);
  const putMut = usePutRatingMutation(publicationId);
  const clearMut = useDeleteRatingMutation(publicationId);
  const busy = putMut.isPending || clearMut.isPending;

  const onSelect = (rating: number) => {
    putMut.mutate(rating);
  };

  const onClear = () => {
    clearMut.mutate();
  };

  const myRating = summary.data?.myRating ?? null;
  const ratingError = putMut.error ?? clearMut.error;
  const selfBlocked = classifySocialError(ratingError).kind === "selfRating";

  return (
    <div className="space-y-4" data-testid="star-rating-input">
      <p className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
        <StarIcon filled={summary.data != null && (summary.data.average ?? 0) > 0} />
        {summary.data
          ? `${formatAverage(summary.data.average)} / 5 · ${summary.data.ratingCount} ${summary.data.ratingCount === 1 ? "rating" : "ratings"}`
          : "Loading ratings…"}
      </p>

      {selfBlocked ? (
        // §5 409 COMMUNITY_SELF_RATING_NOT_ALLOWED — informative state.
        <p
          role="alert"
          className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/60 px-3 py-2 text-sm font-medium text-[#64748B]"
        >
          You cannot rate your own quiz.
        </p>
      ) : (
        <>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Your rating
            </legend>
            <StarRadioGroup value={myRating} busy={busy} onSelect={onSelect} />
          </fieldset>
          {myRating != null && (
            <div className="space-y-2">
              <Badge variant="accent">Your rating: {myRating}</Badge>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11"
                  disabled={clearMut.isPending}
                  aria-busy={clearMut.isPending}
                  onClick={onClear}
                >
                  {clearMut.isPending ? <Spinner /> : null}
                  Clear my rating
                </Button>
              </div>
            </div>
          )}
          {ratingError != null && (
            <p role="alert" className="text-sm font-medium text-[#EF4444]">
              {describeRatingError(ratingError)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
