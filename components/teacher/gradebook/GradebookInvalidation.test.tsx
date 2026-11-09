// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { ClassSessionsTab } from "@/components/teacher/class-sessions/ClassSessionsTab";
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
 * CLASS-M3 (#54, review F2) — regression: assign/unassign change more than
 * the sessions list (the gradebook column catalog/matrix and the analytics
 * KPIs read the same associations), so both mutations must invalidate the
 * whole `["classrooms", id]` prefix — not just `["classrooms", id, "sessions"].
 * Stale keys would make the Gradebook export/toggle reference unassigned
 * sessions (a server 400 with no visible cause).
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

let qc: QueryClient;
let invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>;

function mount() {
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
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(qc, "invalidateQueries");
});

afterEach(cleanup);

describe("assign/unassign invalidation (CLASS-M3 review F2)", () => {
  it("assign invalidates the whole classroom prefix (gradebook + analytics)", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([]));
    vi.mocked(getAssignableSessions).mockResolvedValue(pageOf([assignable()]));

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Assign session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Assign" }));

    await waitFor(() => expect(assignSessionToClassroom).toHaveBeenCalledWith(5, 31));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["classrooms", 5] })
    );
  });

  it("unassign invalidates the whole classroom prefix (gradebook + analytics)", async () => {
    vi.mocked(getClassroomSessions).mockResolvedValue(pageOf([session()]));

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);

    await waitFor(() => expect(unassignSessionFromClassroom).toHaveBeenCalledWith(5, 21));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["classrooms", 5] })
    );
  });
});
