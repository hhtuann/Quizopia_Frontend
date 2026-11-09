// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassOverviewKpis } from "./ClassOverviewKpis";
import { getClassroomAnalytics, type ClassroomAnalyticsResponse } from "@/lib/api/classrooms";
import type * as ClassroomsApi from "@/lib/api/classrooms";

/**
 * CLASS-M3 (#54) — the teacher class Overview KPIs (from /analytics): counts
 * render as numbers; a null overall completion renders "—" (never 0); the
 * per-session trend list shows completion/average with the same null rule.
 */

vi.mock("@/lib/api/classrooms", async (importOriginal) => {
  const actual = await importOriginal<typeof ClassroomsApi>();
  return {
    ...actual,
    getClassroomAnalytics: vi.fn(),
  };
});

function analytics(overrides: Partial<ClassroomAnalyticsResponse> = {}): ClassroomAnalyticsResponse {
  return {
    sessionId: null,
    currentRosterSize: 12,
    assignedSessionCount: 4,
    overallCompletionPercentage: 62.5,
    sessions: [
      {
        sessionId: 61,
        code: "Q1",
        title: "Quiz 1",
        status: "CLOSED",
        startsAt: "2026-11-01T08:00:00Z",
        cohortSize: 12,
        startedCount: 9,
        submittedCount: 9,
        gradedCount: 9,
        completionPercentage: 75,
        averagePercentage: 60,
      },
      {
        sessionId: 62,
        code: "Q2",
        title: "Quiz 2",
        status: "OPEN",
        startsAt: "2026-11-05T08:00:00Z",
        cohortSize: 12,
        startedCount: 0,
        submittedCount: 0,
        gradedCount: 0,
        completionPercentage: null,
        averagePercentage: null,
      },
    ],
    historyCoverage: "SINCE_MIGRATION",
    ...overrides,
  } satisfies ClassroomAnalyticsResponse;
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ClassOverviewKpis classroomId={5} />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClassroomAnalytics).mockResolvedValue(analytics());
});

afterEach(cleanup);

describe("ClassOverviewKpis (CLASS-M3)", () => {
  it("renders the KPI counts and the rounded overall completion", async () => {
    mount();

    // Await a data-derived node first (the dt labels render while pending).
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("Current roster")).toBeTruthy();
    expect(screen.getByText("Assigned sessions")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("63%")).toBeTruthy(); // 62.5 rounds up

    // Trend list with per-session completion · avg (null → "—", never 0).
    expect(screen.getByText("Quiz 1")).toBeTruthy();
    expect(screen.getByText("Quiz 2")).toBeTruthy();
    expect(screen.getAllByText(/completion 75%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/completion —/).length).toBeGreaterThan(0);
  });

  it("renders '—' for a null overall completion (never 0)", async () => {
    vi.mocked(getClassroomAnalytics).mockResolvedValue(
      analytics({ overallCompletionPercentage: null })
    );

    mount();

    expect(await screen.findByText("Overall completion")).toBeTruthy();
    expect(await screen.findByText("—")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("degrades gracefully when analytics fail to load", async () => {
    vi.mocked(getClassroomAnalytics).mockRejectedValue(new Error("network"));

    mount();

    expect(await screen.findByText(/Analytics are unavailable right now/i)).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
