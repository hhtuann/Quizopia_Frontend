import { describe, expect, it, vi } from "vitest";
import { fetchAllSessionResults } from "./teacher-reporting";
import type { SessionResultsPage, SessionResultsParams } from "./teacher-reporting";

/**
 * FE-7a regression: the attempt picker needs best-attempt ids for EVERY
 * participant — the fetcher must follow the server's pagination instead of
 * stopping at the first page.
 */

function page(items: number[], page: number, totalPages: number): SessionResultsPage {
  return {
    items: items.map((studentId) => ({
      studentId,
      studentCode: null,
      displayName: `s${studentId}`,
      bestAttemptId: studentId * 10,
      attemptCount: 1,
      submittedAt: null,
      score: null,
      maxScore: null,
      percentage: null,
      gradeStatus: "GRADED",
    })),
    page,
    size: 200,
    totalElements: items.length,
    totalPages,
    sort: "studentName",
    direction: "ASC",
  };
}

describe("fetchAllSessionResults (FE-7a pagination)", () => {
  it("follows every page until the server reports the last one", async () => {
    const fetchPage = vi.fn(
      async (_id: number, params: SessionResultsParams) => {
        if (params.page === 0) return page([1, 2], 0, 3);
        if (params.page === 1) return page([3, 4], 1, 3);
        return page([5], 2, 3);
      }
    );

    const items = await fetchAllSessionResults(9, fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 9, { page: 0, size: 200 });
    expect(fetchPage).toHaveBeenLastCalledWith(9, { page: 2, size: 200 });
    expect(items.map((i) => i.studentId)).toEqual([1, 2, 3, 4, 5]);
    // Every participant keeps their best attempt id.
    expect(items.filter((i) => i.bestAttemptId != null)).toHaveLength(5);
  });

  it("stops at one page when the roster fits", async () => {
    const fetchPage = vi.fn(async () => page([1], 0, 1));
    const items = await fetchAllSessionResults(9, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
  });

  it("caps the walk at 20 pages (defensive upper bound)", async () => {
    const fetchPage = vi.fn(
      async (_id: number, params: SessionResultsParams) =>
        page([params.page ?? 0], params.page ?? 0, 10_000)
    );
    const items = await fetchAllSessionResults(9, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(20);
    expect(items).toHaveLength(20);
  });
});
