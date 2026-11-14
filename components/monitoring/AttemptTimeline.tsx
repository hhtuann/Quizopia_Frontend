"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, cardVariants } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils/cn";
import {
  DEFAULT_TIMELINE_FILTERS,
  useAttemptTimelineQuery,
  type TimelineFilters,
} from "@/hooks/queries/use-monitoring";
import {
  TIMELINE_GROUPS,
  timelineGroupOf,
  describeTimelineItem,
  type TimelineGroupValue,
} from "@/lib/monitoring/timeline";
import type { AttemptTimelineItem } from "@/lib/api/monitoring";

/**
 * Group accent for the event dot: server-confirmed answers/lifecycle pop,
 * attention events (tab/focus) warn, connection/saving stays alarming.
 */
const GROUP_DOT: Record<TimelineGroupValue, string> = {
  ALL: "bg-[#64748B]",
  ANSWERS: "bg-[#0052FF]",
  NAVIGATION: "bg-[#8B5CF6]",
  ATTENTION: "bg-[#F59E0B]",
  CONNECTION: "bg-[#EF4444]",
  LIFECYCLE: "bg-[#10B981]",
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Reusable attempt activity timeline (Phase 4-A4): cursor-paged list with
 * source/type filters, "Load more" via nextCursor, and an aria-live region
 * announcing newly arrived items. Rendering data comes from the pure helpers
 * in `lib/monitoring/timeline` (labels, source badges, clock-skew chip,
 * ANSWER_ACCEPTED summaries — metadata only, never answer content).
 *
 * Used by the teacher "Activity" panel and the student result page.
 */
export function AttemptTimeline({
  attemptId,
  questionLabels,
  title = "Activity timeline",
  emptyHint = "No activity recorded yet.",
  className,
}: {
  attemptId: number;
  /** attemptQuestionId → display label (e.g. "Q3"); falls back to `Q<id>`. */
  questionLabels?: Record<number, string>;
  title?: string;
  emptyHint?: string;
  className?: string;
}) {
  const [filters, setFilters] = useState<TimelineFilters>(DEFAULT_TIMELINE_FILTERS);
  const query = useAttemptTimelineQuery(attemptId, filters);

  const items: AttemptTimelineItem[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];

  // Announce newly arrived items (live refetch / Load more) politely.
  const prevCountRef = useRef(items.length);
  const [announcement, setAnnouncement] = useState<string>("");
  useEffect(() => {
    const delta = items.length - prevCountRef.current;
    prevCountRef.current = items.length;
    if (delta > 0) {
      setAnnouncement(`${delta} new activity event${delta === 1 ? "" : "s"}`);
    }
  }, [items.length]);

  return (
    <div className={cn(cardVariants(), "p-6", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
          {title}
        </h3>
        <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          {items.length} event{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Filters: source toggle + type-group select */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div>
          <p className="sr-only">Filter by source</p>
          <SegmentedControl
            aria-label="Filter by source"
            value={filters.source}
            onChange={(source) => setFilters((f) => ({ ...f, source }))}
            options={[
              { label: "All sources", value: "ALL" },
              { label: "Client", value: "CLIENT" },
              { label: "Server", value: "SERVER" },
            ]}
          />
        </div>
        <div className="min-w-48 flex-1">
          <label
            htmlFor={`timeline-group-${attemptId}`}
            className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
          >
            Event type
          </label>
          <select
            id={`timeline-group-${attemptId}`}
            value={filters.group}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                group: e.target.value as TimelineGroupValue,
              }))
            }
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 pr-9 text-sm font-medium text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
          >
            {TIMELINE_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {query.isPending ? (
        <p role="status" className="animate-pulse py-6 text-center text-sm text-[#64748B]">
          Loading activity…
        </p>
      ) : query.isError ? (
        <p role="alert" className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-3 text-sm font-medium text-[#EF4444]">
          Couldn&apos;t load the activity timeline.{" "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : items.length === 0 && !query.hasNextPage ? (
        <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
          {emptyHint}
        </p>
      ) : (
        <>
          <ul className="space-y-1.5" aria-label="Activity events">
            {items.map((item) => {
              const view = describeTimelineItem(item, questionLabels);
              return (
                <li
                  key={item.eventId}
                  className="flex flex-col gap-1 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 shrink-0 rounded-full",
                        GROUP_DOT[timelineGroupOf(item.eventType)]
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-semibold text-[#0F172A]">
                      {view.label}
                    </span>
                    <Badge variant={item.source === "SERVER" ? "accent" : "default"}>
                      {view.sourceLabel}
                    </Badge>
                    {view.summary && (
                      <span className="truncate text-xs font-medium text-[#64748B]">
                        {view.summary}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-0.5 text-xs text-[#94A3B8] sm:items-end">
                    <span className="font-medium tabular-nums text-[#64748B]">
                      {formatTime(item.serverReceivedAt)}
                    </span>
                    {item.clientOccurredAt && (
                      <span className="flex items-center gap-1.5 tabular-nums">
                        client {formatTime(item.clientOccurredAt)}
                        {view.skewed && (
                          <span
                            title={`Client clock differs by ${Math.round(Math.abs(view.skewMs! / 1000))}s`}
                            className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]"
                          >
                            clock skew
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {query.hasNextPage && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
