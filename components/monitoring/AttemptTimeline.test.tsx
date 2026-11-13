// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptTimeline } from "./AttemptTimeline";
import { useAttemptTimelineQuery } from "@/hooks/queries/use-monitoring";
import type { AttemptTimelineResponse } from "@/lib/api/monitoring";

/**
 * Component test with the query hook mocked — no QueryClient provider needed.
 * Covers: row rendering (label + source badge + summary), the source filter
 * driving query params, and the Load-more button via nextCursor.
 */

const fetchNextPage = vi.fn();

vi.mock("@/hooks/queries/use-monitoring", () => ({
  useAttemptTimelineQuery: vi.fn(),
  DEFAULT_TIMELINE_FILTERS: { source: "ALL", group: "ALL" },
}));

const timelineQuery = vi.mocked(useAttemptTimelineQuery);

function page(items: AttemptTimelineResponse["items"], nextCursor: string | null): AttemptTimelineResponse {
  return { attemptId: 12, items, nextCursor, serverTime: "2026-07-10T09:00:00Z" };
}

beforeEach(() => {
  fetchNextPage.mockReset();
});

afterEach(cleanup);

function mockQuery(options: {
  pages?: AttemptTimelineResponse[];
  hasNextPage?: boolean;
}) {
  timelineQuery.mockReturnValue({
    data: { pages: options.pages ?? [], pageParams: [undefined] },
    hasNextPage: options.hasNextPage ?? false,
    isFetchingNextPage: false,
    fetchNextPage,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof timelineQuery>);
}

describe("AttemptTimeline", () => {
  it("renders labels, source badges and ANSWER_ACCEPTED summaries from metadata", () => {
    mockQuery({
      pages: [
        page(
          [
            {
              eventId: "e1",
              eventType: "TAB_HIDDEN",
              source: "CLIENT",
              clientOccurredAt: "2026-07-10T08:00:00Z",
              clientSequence: 0,
              serverReceivedAt: "2026-07-10T08:00:00.500Z",
              metadata: null,
            },
            {
              eventId: "e2",
              eventType: "ANSWER_ACCEPTED",
              source: "SERVER",
              clientOccurredAt: null,
              clientSequence: null,
              serverReceivedAt: "2026-07-10T08:01:00Z",
              metadata: { attemptQuestionId: 3, acceptedSequence: 2 },
            },
          ],
          null
        ),
      ],
    });

    render(<AttemptTimeline attemptId={12} questionLabels={{ 3: "Q3" }} />);

    expect(screen.getByText("Tab hidden")).toBeTruthy();
    expect(screen.getAllByText("Client observation").length).toBeGreaterThan(0);
    expect(screen.getByText("Server-confirmed")).toBeTruthy();
    expect(screen.getByText("Answer Q3 → v2 accepted")).toBeTruthy();
    // No load-more without a next cursor.
    expect(screen.queryByText("Load more")).toBeNull();
  });

  it("shows a clock-skew chip when client and server times diverge > 2 minutes", () => {
    mockQuery({
      pages: [
        page(
          [
            {
              eventId: "e1",
              eventType: "PAGE_RELOADED",
              source: "CLIENT",
              clientOccurredAt: "2026-07-10T08:10:00Z",
              clientSequence: 1,
              serverReceivedAt: "2026-07-10T08:00:00Z",
              metadata: null,
            },
          ],
          null
        ),
      ],
    });

    render(<AttemptTimeline attemptId={12} />);
    expect(screen.getByText("clock skew")).toBeTruthy();
  });

  it("renders Load more while a nextCursor exists and forwards the click", () => {
    mockQuery({
      pages: [page([], "cursor-2")],
      hasNextPage: true,
    });

    render(<AttemptTimeline attemptId={12} />);
    fireEvent.click(screen.getByText("Load more"));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("drives the query with source + type-group filters", () => {
    mockQuery({ pages: [page([], null)] });

    render(<AttemptTimeline attemptId={12} />);

    fireEvent.click(screen.getByRole("button", { name: "Client" }));
    expect(timelineQuery).toHaveBeenLastCalledWith(12, {
      source: "CLIENT",
      group: "ALL",
    });

    const groupSelect = screen.getByLabelText("Event type");
    fireEvent.change(groupSelect, { target: { value: "ANSWERS" } });
    expect(timelineQuery).toHaveBeenLastCalledWith(12, {
      source: "CLIENT",
      group: "ANSWERS",
    });

    // Filter controls exist inside the labelled group.
    expect(within(screen.getByRole("group", { name: "Filter by source" })).getAllByRole("button").length).toBe(3);
  });

  it("renders the empty hint when the first page has no items", () => {
    mockQuery({ pages: [page([], null)] });
    render(<AttemptTimeline attemptId={12} emptyHint="Nothing here." />);
    expect(screen.getByText("Nothing here.")).toBeTruthy();
  });
});
