// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradebookTab } from "./GradebookTab";
import {
  exportGradebook,
  getGradebook,
  getGradebookSessions,
  type GradebookCell,
  type GradebookCellStatus,
  type GradebookResponse,
  type GradebookSessionColumn,
  type GradebookStudentRow,
} from "@/lib/api/classrooms";
import type * as ClassroomsApi from "@/lib/api/classrooms";

/**
 * CLASS-M3 (#54) — the teacher Gradebook tab: the matrix renders per-state
 * cells aligned to the response session order; search (debounced), sort and
 * direction drive the fetch contract; the column picker swaps in an explicit
 * sessionIds list (reset returns to the server default); pagination clamps;
 * empty/error/403 states included; export only fires with a healthy matrix.
 */

vi.mock("@/lib/api/classrooms", async (importOriginal) => {
  const actual = await importOriginal<typeof ClassroomsApi>();
  return {
    ...actual,
    getGradebookSessions: vi.fn(),
    getGradebook: vi.fn(),
    exportGradebook: vi.fn(),
  };
});

function column(overrides: Partial<GradebookSessionColumn> = {}): GradebookSessionColumn {
  return {
    id: 101,
    code: "Q1",
    title: "Quiz 1",
    status: "CLOSED",
    startsAt: "2026-11-01T08:00:00Z",
    endsAt: "2026-11-01T09:00:00Z",
    windowState: "WINDOW",
    examId: 7,
    examTitle: "Algebra",
    cohortSize: 2,
    startedCount: 2,
    submittedCount: 2,
    gradedCount: 2,
    completionPercentage: 75,
    averagePercentage: 60,
    ...overrides,
  } satisfies GradebookSessionColumn;
}

function cell(status: GradebookCellStatus, overrides: Partial<GradebookCell> = {}): GradebookCell {
  return { status, score: null, maxScore: null, percentage: null, bestAttemptId: null, attemptCount: null, gradeStatus: null, ...overrides } satisfies GradebookCell;
}

function student(overrides: Partial<GradebookStudentRow> = {}): GradebookStudentRow {
  return {
    userId: 1,
    displayName: "Alice Nguyen",
    currentMember: true,
    cells: [],
    meanPercentage: 70,
    cohortSessions: 5,
    submittedSessions: 3,
    completionPercentage: 60,
    ...overrides,
  } satisfies GradebookStudentRow;
}

function matrixResponse(
  sessions: GradebookSessionColumn[],
  students: GradebookStudentRow[],
  extra: Partial<GradebookResponse> = {}
): GradebookResponse {
  return {
    sessions,
    students,
    page: 0,
    size: 20,
    totalElements: students.length,
    totalPages: 1,
    sort: "displayName,asc",
    historyCoverage: "SINCE_MIGRATION",
    ...extra,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <GradebookTab classId={5} />
      </QueryClientProvider>
    </StrictMode>
  );
}

const COLUMNS: GradebookSessionColumn[] = Array.from({ length: 6 }, (_, i) =>
  column({ id: 101 + i, code: `Q${i + 1}`, title: `Quiz ${i + 1}` })
);
const DEFAULT_IDS = [101, 102, 103, 104, 105];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getGradebookSessions).mockResolvedValue({
    items: COLUMNS,
    page: 0,
    size: 50,
    totalElements: COLUMNS.length + 2, // catalog continues past page 0
    totalPages: 1,
    sort: "startsAt,desc",
  });
  vi.mocked(getGradebook).mockResolvedValue(matrixResponse(COLUMNS.slice(0, 5), [student()]));
  vi.mocked(exportGradebook).mockResolvedValue({
    blob: new Blob(["xlsx"]),
    filename: "quizopia-class-5-gradebook-test.xlsx",
  });
});

afterEach(cleanup);

describe("GradebookTab (CLASS-M3)", () => {
  it("renders rows, per-state cells and the departed marker", async () => {
    vi.mocked(getGradebook).mockResolvedValue(
      matrixResponse(COLUMNS.slice(0, 5), [
        student({
          cells: [
            cell("SCORED", { score: 7, maxScore: 10, percentage: 70, bestAttemptId: 900 }),
            cell("PENDING_GRADING"),
            cell("IN_PROGRESS"),
            cell("NOT_ATTEMPTED"),
            cell("NOT_IN_COHORT"),
          ],
        }),
        student({
          userId: 2,
          displayName: "Bob Tran",
          currentMember: false,
          meanPercentage: null,
          completionPercentage: null,
          cells: [cell("UPCOMING"), cell("DRAFT"), cell("CANCELLED"), cell("NOT_HELD"), cell("SCORED", { score: 5, maxScore: 10, percentage: 50 })],
        }),
      ])
    );

    mount();

    // Column catalog + matrix fetched on mount with the documented defaults.
    expect(await screen.findByText("Alice Nguyen")).toBeTruthy();
    expect(getGradebookSessions).toHaveBeenCalledWith(5, { page: 0, size: 50 });
    expect(getGradebook).toHaveBeenLastCalledWith(5, {
      sessionIds: undefined,
      page: 0,
      size: 20,
      search: undefined,
      sort: "displayName",
      direction: "asc",
    });

    // Per-state cells (status readable as text, not color-only).
    expect(screen.getByText("7/10 · 70%")).toBeTruthy();
    expect(screen.getByText("Pending grading")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Not attempted")).toBeTruthy();
    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.getByText("Not held")).toBeTruthy();
    // NOT_IN_COHORT renders a readable "n/a" with the full accessible name.
    const naCell = screen.getByLabelText("Not in cohort");
    expect(naCell.textContent).toBe("n/a");

    // Subline counts the whole catalog (totalElements), not the page-0 slice.
    expect(screen.getByText(/5 of 8 session columns/)).toBeTruthy();

    // SINCE_MIGRATION history coverage is disclosed to the teacher.
    expect(
      screen.getByText(/Membership history is complete from the analytics migration onward/i)
    ).toBeTruthy();

    // Departed student marker + null row metrics render "—".
    expect(screen.getByText("Bob Tran")).toBeTruthy();
    expect(screen.getByText("(left)")).toBeTruthy();

    // Per-column footer summary (completion · avg).
    expect(screen.getAllByText("75% · 60%").length).toBeGreaterThan(0);
  });

  it("drives the paged fetch contract: Next advances, search resets to page 0", async () => {
    vi.mocked(getGradebook).mockResolvedValue(
      matrixResponse(COLUMNS.slice(0, 5), [student()], { totalElements: 40, totalPages: 2 })
    );

    mount();
    expect(await screen.findByText("Alice Nguyen")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(getGradebook).toHaveBeenLastCalledWith(5, {
        sessionIds: undefined,
        page: 1,
        size: 20,
        search: undefined,
        sort: "displayName",
        direction: "asc",
      }));

    // Debounced search commits after 300ms and resets pagination.
    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "alice" } });
    await waitFor(
      () =>
        expect(getGradebook).toHaveBeenLastCalledWith(5, {
          sessionIds: undefined,
          page: 0,
          size: 20,
          search: "alice",
          sort: "displayName",
          direction: "asc",
        }),
      { timeout: 2000 }
    );
  });

  it("passes the sort field and direction to the fetch", async () => {
    mount();
    expect(await screen.findByText("Alice Nguyen")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sort students by"), {
      target: { value: "meanPercentage" },
    });
    await waitFor(() =>
      expect(getGradebook).toHaveBeenLastCalledWith(5, {
        sessionIds: undefined,
        page: 0,
        size: 20,
        search: undefined,
        sort: "meanPercentage",
        direction: "asc",
      }));

    fireEvent.click(screen.getByRole("button", { name: "Sort direction: ascending" }));
    await waitFor(() =>
      expect(getGradebook).toHaveBeenLastCalledWith(5, {
        sessionIds: undefined,
        page: 0,
        size: 20,
        search: undefined,
        sort: "meanPercentage",
        direction: "desc",
      }));
    expect(screen.getByRole("button", { name: "Sort direction: descending" })).toBeTruthy();

    // Security review P2 regression: the Completion option must send the
    // server allowlist value "completion" — anything else 400s the matrix.
    fireEvent.change(screen.getByLabelText("Sort students by"), {
      target: { value: "completion" },
    });
    await waitFor(() =>
      expect(getGradebook).toHaveBeenLastCalledWith(5, {
        sessionIds: undefined,
        page: 0,
        size: 20,
        search: undefined,
        sort: "completion",
        direction: "desc",
      }));
  });

  it("toggles columns into an explicit sessionIds list and resets to the default", async () => {
    mount();
    expect(await screen.findByText("Quiz 6")).toBeTruthy();

    // Adding the 6th column makes the selection explicit.
    fireEvent.click(screen.getByRole("button", { name: /Quiz 6/ }));
    await waitFor(() =>
      expect(getGradebook).toHaveBeenLastCalledWith(5, {
        sessionIds: [...DEFAULT_IDS, 106],
        page: 0,
        size: 20,
        search: undefined,
        sort: "displayName",
        direction: "asc",
      }));

    // Reset drops the explicit list back to the server default.
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() =>
      expect(getGradebook).toHaveBeenLastCalledWith(5, {
        sessionIds: undefined,
        page: 0,
        size: 20,
        search: undefined,
        sort: "displayName",
        direction: "asc",
      }));
  });

  it("exports the selected columns as an XLSX blob, honoring the active search", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    mount();
    expect(await screen.findByText("Alice Nguyen")).toBeTruthy();

    // No filter yet → export carries the default columns without a search.
    fireEvent.click(screen.getByRole("button", { name: "Export XLSX" }));
    await waitFor(() => expect(exportGradebook).toHaveBeenCalledWith(5, DEFAULT_IDS, undefined));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());

    // Review P3: the export mirrors the matrix's active student filter.
    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "alice" } });
    await waitFor(
      () => expect(getGradebook).toHaveBeenLastCalledWith(5, expect.objectContaining({ search: "alice" })),
      { timeout: 2000 }
    );
    fireEvent.click(screen.getByRole("button", { name: "Export XLSX" }));
    await waitFor(() => expect(exportGradebook).toHaveBeenLastCalledWith(5, DEFAULT_IDS, "alice"));
  });

  it("shows the no-sessions empty state pointing at the Sessions tab", async () => {
    vi.mocked(getGradebookSessions).mockResolvedValue({
      items: [],
      page: 0,
      size: 50,
      totalElements: 0,
      totalPages: 0,
      sort: "startsAt,desc",
    });

    mount();

    expect(await screen.findByText(/Assign sessions in the Sessions tab/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the no-students empty state pointing at the Students tab", async () => {
    vi.mocked(getGradebook).mockResolvedValue(matrixResponse(COLUMNS.slice(0, 5), []));

    mount();

    expect(await screen.findByText(/Add students in the Students tab/i)).toBeTruthy();
  });

  it("disables export and offers retry while the matrix is in error", async () => {
    vi.mocked(getGradebook).mockRejectedValue(new Error("network"));

    mount();

    expect(await screen.findByRole("alert")).toBeTruthy();
    const exportBtn = screen.getByRole("button", { name: "Export XLSX" });
    expect((exportBtn as HTMLButtonElement).disabled).toBe(true);

    // Retry refetches the matrix.
    vi.mocked(getGradebook).mockResolvedValue(matrixResponse(COLUMNS.slice(0, 5), [student()]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Alice Nguyen")).toBeTruthy());
  });

  it("renders the permission card on 403", async () => {
    vi.mocked(getGradebookSessions).mockRejectedValue(
      Object.assign(new Error("403"), { kind: "api", code: "CLASSROOM_ACCESS_DENIED" })
    );
    vi.mocked(getGradebook).mockRejectedValue(
      Object.assign(new Error("403"), { kind: "api", code: "CLASSROOM_ACCESS_DENIED" })
    );

    mount();

    expect(await screen.findByText(/You don’t have permission to view this gradebook/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("clamps the page when the result set shrinks below it", async () => {
    vi.mocked(getGradebook).mockImplementation((_id, params = {}) => {
      const page = params.page ?? 0;
      return Promise.resolve(
        page === 0
          ? matrixResponse(COLUMNS.slice(0, 5), [student()], { totalElements: 40, totalPages: 2 })
          : matrixResponse(COLUMNS.slice(0, 5), [student()], { page, totalElements: 20, totalPages: 1 })
      );
    });

    mount();
    expect(await screen.findByText("Page 1 of 2")).toBeTruthy();

    // Next lands on page 1, which now reports only 1 page → clamp back to 0.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(getGradebook).toHaveBeenCalledWith(5, expect.objectContaining({ page: 1 })));
    await waitFor(
      () => expect(getGradebook).toHaveBeenLastCalledWith(5, expect.objectContaining({ page: 0 })),
      { timeout: 2000 }
    );
  });

  it("sort options stay within the server allowlist (drift guard)", async () => {
    mount();

    const select = await screen.findByLabelText("Sort students by");
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    // Hardcoded copy of the backend sort allowlist — the F1 regression:
    // any other value 400s the whole matrix (CLASSROOM_GRADEBOOK_INVALID_QUERY).
    expect(values).toEqual(["displayName", "meanPercentage", "completion"]);
  });
});
