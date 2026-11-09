// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassSessionsTab } from "./ClassSessionsTab";
import {
  assignSessionToClassroom,
  getAssignableSessions,
  getClassroomSessions,
  unassignSessionFromClassroom,
  type AssignableSessionItem,
  type ClassroomSessionItem,
  type ClassroomSessionsPage,
} from "@/lib/api/classrooms";
import type * as ClassroomsApi from "@/lib/api/classrooms";

/**
 * CLASS-M2 (#52) — the teacher class Sessions tab: assigned sessions render
 * with status/window and deep links to the canonical session editor; the
 * assign picker lists only eligible sessions and calls the ADDITIVE
 * endpoint; removal is confirm-gated; lifecycle-ineligible rows expose no
 * Remove; empty/error states included.
 */

vi.mock("@/lib/api/classrooms", async (importOriginal) => {
  const actual = await importOriginal<typeof ClassroomsApi>();
  return {
    ...actual,
    getClassroomSessions: vi.fn(),
    getAssignableSessions: vi.fn(),
    assignSessionToClassroom: vi.fn(),
    unassignSessionFromClassroom: vi.fn(),
  };
});

function session(overrides: Partial<ClassroomSessionItem> = {}): ClassroomSessionItem {
  return {
    sessionId: 21,
    code: "SES-01",
    title: "Midterm sitting",
    status: "SCHEDULED",
    visibility: "CLASS_RESTRICTED",
    startsAt: "2026-11-10T08:00:00Z",
    endsAt: "2026-11-10T10:00:00Z",
    examId: 7,
    examTitle: "Algebra",
    ...overrides,
  } satisfies ClassroomSessionItem;
}

function assignable(overrides: Partial<AssignableSessionItem> = {}): AssignableSessionItem {
  return {
    sessionId: 31,
    code: "SES-09",
    title: "Quiz sitting",
    status: "DRAFT",
    startsAt: "2026-11-20T08:00:00Z",
    endsAt: "2026-11-20T09:00:00Z",
    examId: 7,
    examTitle: "Algebra",
    ...overrides,
  } satisfies AssignableSessionItem;
}

function pageOf<T>(items: T[]): ClassroomSessionsPage<T> {
  return { items, page: 0, size: 10, totalElements: items.length, totalPages: 1, sort: "startsAt,desc" };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ClassSessionsTab classId={5} onNotice={vi.fn()} />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assignSessionToClassroom).mockResolvedValue(undefined);
  vi.mocked(unassignSessionFromClassroom).mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("ClassSessionsTab (CLASS-M2)", () => {
  it("renders assigned sessions with status, window and deep link", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(
      pageOf([session({}), session({ sessionId: 22, title: "Past sitting", status: "CLOSED" })])
    );

    mount();

    expect(await screen.findByText("Midterm sitting")).toBeTruthy();
    expect(screen.getByText("Past sitting")).toBeTruthy();
    expect(screen.getByText("SCHEDULED")).toBeTruthy();
    expect(screen.getByText("CLOSED")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Midterm sitting" }).getAttribute("href")
    ).toBe("/exams/7/sessions/21");
  });

  it("drives the paged query with the status filter and search", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([session()]));

    mount();
    expect(await screen.findByText("Midterm sitting")).toBeTruthy();
    expect(getClassroomSessions).toHaveBeenLastCalledWith(5, {
      page: 0,
      size: 10,
      status: undefined,
      search: undefined,
    });

    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    await waitFor(() =>
      expect(getClassroomSessions).toHaveBeenLastCalledWith(5, {
        page: 0,
        size: 10,
        status: "CLOSED",
        search: undefined,
      }));

    fireEvent.change(screen.getByLabelText("Search assigned sessions"), {
      target: { value: "midterm" },
    });
    fireEvent.submit(screen.getByLabelText("Search assigned sessions").closest("form")!);
    await waitFor(() =>
      expect(getClassroomSessions).toHaveBeenLastCalledWith(5, {
        page: 0,
        size: 10,
        status: "CLOSED",
        search: "midterm",
      }));
  });

  it("shows the empty state distinguishing no-assignment from no-match", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([]));

    mount();

    expect(await screen.findByText(/No sessions assigned to this class yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("renders the error state on transport failure", async () => {
    vi.mocked(getClassroomSessions).mockRejectedValue(new Error("network"));

    mount();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("unassigns only after confirmation", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([session()]));
    vi.mocked(getAssignableSessions).mockResolvedValue(pageOf([]));

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    // ConfirmDialog visible with the safety copy.
    expect(await screen.findByText("Remove session from class?")).toBeTruthy();
    expect(screen.getByText(/stays available to your other classes/i)).toBeTruthy();

    // The dialog's confirm is the second "Remove" button (row + dialog).
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);

    await waitFor(() => expect(unassignSessionFromClassroom).toHaveBeenCalledWith(5, 21));
  });

  it("offers Remove only for DRAFT/SCHEDULED rows", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(
      pageOf([session({ sessionId: 21, status: "OPEN" }), session({ sessionId: 22 })])
    );

    mount();

    await screen.findByText("SCHEDULED");
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(1); // only the SCHEDULED row
  });

  it("assigns from the picker via the additive endpoint", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([]));
    vi.mocked(getAssignableSessions).mockResolvedValue(pageOf([assignable()]));

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Assign session" }));

    const assignBtn = await screen.findByRole("button", { name: "Assign" });
    fireEvent.click(assignBtn);

    await waitFor(() => expect(assignSessionToClassroom).toHaveBeenCalledWith(5, 31));
  });

  it("picker explains when there is nothing eligible to assign", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([]));
    vi.mocked(getAssignableSessions).mockResolvedValue(pageOf([]));

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Assign session" }));

    expect(await screen.findByText(/No eligible sessions to assign/i)).toBeTruthy();
  });
});
