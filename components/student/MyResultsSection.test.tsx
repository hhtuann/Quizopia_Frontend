// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyResultsSection } from "./MyResultsSection";
import { getMyResults, type LearnerMyResultsItem, type LearnerMyResultsPage } from "@/lib/api/classrooms";
import type * as ClassroomsApi from "@/lib/api/classrooms";

/**
 * CLASS-M3 (#54) — the learner My Results list: per-session cards with the
 * gradebook status color semantics; "View result" appears (and deep-links to
 * the existing /attempts/{bestAttemptId}/result page) only for SCORED rows;
 * empty / error / 404 states and the paged fetch contract.
 */

vi.mock("@/lib/api/classrooms", async (importOriginal) => {
  const actual = await importOriginal<typeof ClassroomsApi>();
  return {
    ...actual,
    getMyResults: vi.fn(),
  };
});

function result(overrides: Partial<LearnerMyResultsItem> = {}): LearnerMyResultsItem {
  return {
    sessionId: 61,
    code: "Q1",
    title: "Quiz 1",
    status: "CLOSED",
    startsAt: "2026-11-01T08:00:00Z",
    endsAt: "2026-11-01T09:00:00Z",
    examTitle: "Algebra",
    resultStatus: "SCORED",
    score: 8,
    maxScore: 10,
    percentage: 80,
    bestAttemptId: 900,
    attemptCount: 1,
    ...overrides,
  } satisfies LearnerMyResultsItem;
}

function pageOf(
  items: LearnerMyResultsItem[],
  extra: Partial<LearnerMyResultsPage> = {}
): LearnerMyResultsPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, sort: "startsAt,desc", ...extra };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MyResultsSection classId={5} />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMyResults).mockResolvedValue(pageOf([result()]));
});

afterEach(cleanup);

describe("MyResultsSection (CLASS-M3)", () => {
  it("lists results across states; View result only for SCORED", async () => {
    vi.mocked(getMyResults).mockResolvedValue(
      pageOf([
        result(),
        result({ sessionId: 62, title: "Quiz 2", resultStatus: "PENDING_GRADING", score: null, maxScore: null, percentage: null, bestAttemptId: null }),
        result({ sessionId: 63, title: "Quiz 3", status: "OPEN", resultStatus: "IN_PROGRESS", bestAttemptId: 910 }),
        result({ sessionId: 64, title: "Quiz 4", status: "SCHEDULED", resultStatus: "UPCOMING", bestAttemptId: null }),
      ])
    );

    mount();

    expect(await screen.findByText("Quiz 1")).toBeTruthy();
    expect(screen.getByText("8/10 · 80%")).toBeTruthy(); // SCORED chip text
    expect(screen.getByText("Pending grading")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Upcoming")).toBeTruthy();

    // Only the SCORED row links out, to the canonical attempt result page.
    const viewLinks = screen.getAllByRole("link", { name: "View result" });
    expect(viewLinks).toHaveLength(1);
    expect(viewLinks[0].getAttribute("href")).toBe("/attempts/900/result");
  });

  it("renders the empty state when nothing is graded/open yet", async () => {
    vi.mocked(getMyResults).mockResolvedValue(pageOf([]));

    mount();

    expect(await screen.findByText(/No results yet/i)).toBeTruthy();
  });

  it("renders the error state on transport failure", async () => {
    vi.mocked(getMyResults).mockRejectedValue(new Error("network"));

    mount();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("renders the not-available card on 404 (non-member/left)", async () => {
    vi.mocked(getMyResults).mockRejectedValue(
      Object.assign(new Error("404"), { kind: "api", code: "CLASSROOM_NOT_FOUND" })
    );

    mount();

    expect(await screen.findByText(/Class not available/i)).toBeTruthy();
    expect(screen.getByText(/not a member of this class/i)).toBeTruthy();
  });

  it("paginates results (fetch contract)", async () => {
    vi.mocked(getMyResults).mockResolvedValue(
      pageOf([result({ title: "Page One Quiz" })], { totalElements: 2, totalPages: 2 })
    );

    mount();
    expect(await screen.findByText("Page 1 of 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(getMyResults).toHaveBeenLastCalledWith(5, { page: 1, size: 20 }));
  });
});
