"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCommunityPublicationQuery,
} from "@/hooks/queries/use-community";
import {
  usePublicSocialSummaryQuery,
  useSocialSummaryQuery,
} from "@/hooks/queries/use-community-social";
import { useAuth } from "@/hooks/useAuth";
import { PublicationActionToolbar } from "@/components/community/PublicationActionToolbar";
import { CommentSection } from "@/components/community/CommentSection";
import { formatAverage } from "@/components/community/StarRatingInput";
import { Badge, Card, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { buildLoginRedirect } from "@/lib/auth/redirect";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Public Community quiz detail (P3-A-FE1, issue #43 — ADR-006 §7/§10;
 * social toolbar per ADR-007 §7, issue #67).
 *
 * Anonymous, safe-by-construction: renders ONLY the `PublicPublicationDetail`
 * allowlist (title, alias credit, category, tags, counts, duration, dates) as
 * React text — no question/option/answer content, no exam ids, no PII exist in
 * the consumed type, and nothing is ever rendered as HTML/markdown.
 *
 * A 404 (absent, unpublished, hidden or archived source) renders a neutral
 * not-available state — the §7 anti-enumeration posture gives no reason why.
 *
 * The two large Save/Fork panels are gone: one compact toolbar (#67) below the
 * metadata card owns Like/Comment/Rate/Fork/Save with the full §7 auth matrix
 * (guest login CTAs with `returnTo`, STUDENT fork state, TEACHER consent
 * dialog, idempotent explicit-loading writes). The rating aggregate moves
 * into the metadata area — rendered for guests too, fed by the ANONYMOUS
 * social-summary — and the Comment button anchor-scrolls to the labelled
 * `#discussion` section below the toolbar, whose body (#68) is the paginated
 * discussion: newest-first plain-text comments with the alias-consent editor,
 * own edit/delete, report dialog and star-rating selector.
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
  const { status } = useAuth();
  const authenticated = status === "authenticated";

  const { data, isPending, isError, error } = useCommunityPublicationQuery(
    id,
    validId
  );
  const normalized = error as unknown as NormalizedApiError | undefined;
  const notFound =
    normalized?.kind === "api" &&
    (normalized.status === 404 || normalized.code === "COMMUNITY_NOT_FOUND");

  // §5 social-summary twins: the anonymous one feeds the guest-visible
  // aggregates, the authenticated one (aggregates + caller states) takes
  // over for signed-in users. The toolbar holds its own copies under the
  // same keys — one request, one cache entry.
  const publicSocial = usePublicSocialSummaryQuery(id, validId && !authenticated);
  const mySocial = useSocialSummaryQuery(id, validId && authenticated);
  const social = authenticated ? mySocial.data : publicSocial.data;

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

      <Card variant="elevated" className="p-6 sm:p-10">
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

        {/* §7 aggregate — guest-visible, fed by the anonymous social-summary
            ("—" until it lands, and for a null average = zero ratings). */}
        <p
          data-testid="rating-aggregate"
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[#0F172A]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-4 w-4 shrink-0 text-[#F59E0B]"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
            />
          </svg>
          {social
            ? `${formatAverage(social.average)} / 5 · ${social.ratingCount} ${social.ratingCount === 1 ? "rating" : "ratings"}`
            : "— / 5"}
        </p>

        {data.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}
      </Card>

      {/* §7 toolbar (#67) — compact Like → Comment → Rate → Fork → Save row
          replacing the two large Save/Fork panels. */}
      <PublicationActionToolbar
        publication={{
          publicationId: data.publicationId,
          title: data.title,
          authorName: data.authorName,
          allowFork: data.allowFork,
        }}
        loginHref={loginHref}
      />

      {/* #68 discussion section: the page keeps the labelled `#discussion`
          anchor + live count heading (the toolbar's Comment button
          anchor-scrolls here); the section body owns the list + editor. */}
      <section
        id="discussion"
        aria-labelledby="discussion-heading"
        className="mt-8 scroll-mt-6"
      >
        <h2
          id="discussion-heading"
          className="font-display text-xl tracking-tight text-[#0F172A]"
        >
          Community Discussion
          {social ? ` (${social.commentCount})` : ""}
        </h2>
        <CommentSection publicationId={data.publicationId} loginHref={loginHref} />
      </section>
    </div>
  );
}

// formatAverage (the §7 2dp display form) is imported from StarRatingInput —
// the single export every aggregate surface consumes.

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
