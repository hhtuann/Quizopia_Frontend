"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMyPublicationsQuery,
  usePublishCommunityPublicationMutation,
  useUnpublishCommunityPublicationMutation,
} from "@/hooks/queries/use-community-owner";
import { useCommunityCategoriesQuery } from "@/hooks/queries/use-community";
import type { OwnerPublication } from "@/lib/api/community-owner";
import type { NormalizedApiError } from "@/lib/api";
import { Badge, Button, Card, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { describeCommunityError } from "@/components/community/community-errors";
import { EditPublicationDialog } from "@/components/community/EditPublicationDialog";

/**
 * My community publications (P3-A-FE2, issue #44 — ADR-006 §7/§10).
 *
 * ROUTE PLACEMENT (documented decision): `app/(teacher)/community/mine` —
 * route groups add no URL segment, so this serves `/community/mine` while
 * inheriting the `(teacher)` group's `RequireAuth requireRole="TEACHER"` +
 * `AppShell` (consistent authenticated nav). The sibling public pages under
 * `app/community/` keep the anonymous `PublicHeader` layout; this page is
 * owner-only teacher surface, so the group gate is exactly right and no new
 * wrapper is needed.
 */

interface Notice {
  kind: "success" | "error" | "conflict";
  message: string;
}

const NOTICE_STYLES: Record<Notice["kind"], string> = {
  success: "border-[#10B981]/30 bg-[#10B981]/5 text-[#0F172A]",
  error: "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]",
  conflict: "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#0F172A]",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MyCommunityPublicationsPage() {
  const { data, isPending, isError, error } = useMyPublicationsQuery();
  const { data: categoriesData } = useCommunityCategoriesQuery();
  const publishMut = usePublishCommunityPublicationMutation();
  const unpublishMut = useUnpublishCommunityPublicationMutation();

  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState<OwnerPublication | null>(null);

  const items = data ?? [];
  // The row the dialog edits may be stale after a refetch — match by id.
  const editingCurrent =
    (editing !== null && items.find((p) => p.publicationId === editing.publicationId)) ??
    editing;

  const onPublish = async (publication: OwnerPublication) => {
    setNotice(null);
    try {
      await publishMut.mutateAsync(publication.publicationId);
      setNotice({
        kind: "success",
        message: `“${publication.title}” is live on the community catalog.`,
      });
    } catch (err) {
      const mapped = describeCommunityError(err);
      setNotice({ kind: mapped.conflict ? "conflict" : "error", message: mapped.message });
    }
  };

  const onUnpublish = async (publication: OwnerPublication) => {
    setNotice(null);
    try {
      await unpublishMut.mutateAsync(publication.publicationId);
      setNotice({
        kind: "success",
        message: `“${publication.title}” was removed from the community catalog.`,
      });
    } catch (err) {
      const mapped = describeCommunityError(err);
      setNotice({ kind: mapped.conflict ? "conflict" : "error", message: mapped.message });
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/exams"
            className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            All exams
          </Link>
          <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">
            My community <span className="gradient-text">publications</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Quizzes you share on the public community catalog. Publish one from a
            published exam&apos;s overview tab.
          </p>
        </div>
        <Link
          href="/community"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11")}
        >
          Browse the community
        </Link>
      </div>

      {notice && (
        <div
          role={notice.kind === "success" ? "status" : "alert"}
          className={cn(
            "mb-6 flex items-start gap-2 rounded-lg border p-4 text-sm font-medium",
            NOTICE_STYLES[notice.kind]
          )}
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
          <span>{notice.message}</span>
        </div>
      )}

      <section aria-label="My community publications" aria-busy={isPending}>
        {isPending ? (
          <ListSkeleton />
        ) : isError ? (
          <LoadError error={error as unknown as NormalizedApiError | undefined} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <OwnerPublicationCard
                key={item.publicationId}
                item={item}
                publishPending={publishMut.isPending && publishMut.variables === item.publicationId}
                unpublishPending={
                  unpublishMut.isPending && unpublishMut.variables === item.publicationId
                }
                onPublish={() => onPublish(item)}
                onUnpublish={() => onUnpublish(item)}
                onEdit={() => {
                  setNotice(null);
                  setEditing(item);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {editingCurrent && (
        <EditPublicationDialog
          open
          publication={editingCurrent}
          categories={categoriesData ?? []}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice({ kind: "success", message: "Community details updated." });
          }}
          onConflict={(message) => {
            setEditing(null);
            setNotice({ kind: "conflict", message });
          }}
        />
      )}
    </div>
  );
}

function OwnerPublicationCard({
  item,
  publishPending,
  unpublishPending,
  onPublish,
  onUnpublish,
  onEdit,
}: {
  item: OwnerPublication;
  publishPending: boolean;
  unpublishPending: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onEdit: () => void;
}) {
  const publiclyVisible = item.status === "PUBLISHED" && item.moderationState === "VISIBLE";
  const publishBlocked = item.status === "UNPUBLISHED" && item.moderationState === "HIDDEN";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.status === "PUBLISHED" ? "success" : "warn"}>
          {item.status === "PUBLISHED" ? "Published" : "Unpublished"}
        </Badge>
        <Badge variant={item.moderationState === "HIDDEN" ? "destructive" : "default"}>
          {item.moderationState === "HIDDEN" ? "Hidden by moderation" : "Visible"}
        </Badge>
        <Badge variant={item.reusePolicy === "ALLOW_FORK" ? "accent" : "default"}>
          {item.reusePolicy === "ALLOW_FORK" ? "Forking allowed" : "No forking"}
        </Badge>
        {item.openReportCount > 0 && (
          <Badge variant="warn">
            {item.openReportCount} open report{item.openReportCount === 1 ? "" : "s"}
          </Badge>
        )}
        {item.categoryTitle && <Badge>{item.categoryTitle}</Badge>}
      </div>

      <h2 className="mt-3 text-lg font-semibold tracking-tight text-[#0F172A]">
        {publiclyVisible ? (
          <Link
            href={`/community/quizzes/${item.publicationId}`}
            className="rounded outline-none transition-colors hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
          >
            {item.title}
          </Link>
        ) : (
          item.title
        )}
      </h2>
      {item.summary && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[#64748B]">
          {item.summary}
        </p>
      )}

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        {item.questionCount} question{item.questionCount === 1 ? "" : "s"} ·{" "}
        {item.sectionCount} section{item.sectionCount === 1 ? "" : "s"} ·{" "}
        {item.durationMinutes} min · by{" "}
        <span className="normal-case text-[#0F172A]">{item.authorAlias ?? "—"}</span>
      </p>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-[#64748B]">
        Published {formatDate(item.publishedAt)} · Updated {formatDate(item.updatedAt)}
      </p>

      {publishBlocked && (
        <p className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-3 py-2 text-xs font-semibold text-[#EF4444]">
          A community moderator has hidden this publication — publishing stays
          blocked until a moderator restores it.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {item.status === "UNPUBLISHED" && !publishBlocked && (
          <Button
            type="button"
            size="sm"
            className="h-11"
            onClick={onPublish}
            disabled={publishPending}
          >
            {publishPending ? "Publishing…" : "Publish"}
          </Button>
        )}
        {item.status === "PUBLISHED" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            onClick={onUnpublish}
            disabled={unpublishPending}
          >
            {unpublishPending ? "Unpublishing…" : "Unpublish"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11"
          onClick={onEdit}
        >
          Edit details
        </Button>
        {publiclyVisible && (
          <Link
            href={`/community/quizzes/${item.publicationId}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-11")}
          >
            View public page
          </Link>
        )}
      </div>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading my community publications" className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F1F5F9]"
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <h2 className="font-display text-xl tracking-tight text-[#0F172A]">
        Nothing published yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-medium text-[#64748B]">
        Share one of your published exams with everyone: open the exam&apos;s
        overview tab and choose “Publish to Community”. You stay in control —
        unpublish any time.
      </p>
      <Link
        href="/exams"
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-6 inline-flex h-11")}
      >
        Go to my exams
      </Link>
    </Card>
  );
}

function LoadError({ error }: { error: NormalizedApiError | undefined }) {
  const message =
    error?.kind === "network"
      ? "Network error — check your connection and try again."
      : error?.kind === "api" && error.status === 429
        ? "Too many requests — please wait a moment and try again."
        : "Couldn't load your community publications. Please try again.";
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
