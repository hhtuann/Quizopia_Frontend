// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyClassesDetailPage from "./page";
import {
  getJoinedClassroom,
  getJoinedClassroomSessions,
  type ClassroomSessionsPage,
  type JoinedClassroomDetail,
  type LearnerClassroomSessionItem,
} from "@/lib/api/classrooms";
import type * as ClassroomsApi from "@/lib/api/classrooms";

/**
 * CLASS-M2 (#52) — the learner's joined-class detail: overview metadata
 * (teacher display name, joined date, session count), assigned sessions
 * across lifecycle states with links delegating start/resume/result to the
 * existing `/sessions/{sessionId}` landing, 404 for non-members, empty and
 * error states, and pagination (asserted at the fetch-contract level — the
 * same useQuery pattern's DOM update behavior is covered by the M1
 * my-classes pagination test).
 */

const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock("@/lib/api/classrooms", async (importOriginal) => {
  const actual = await importOriginal<typeof ClassroomsApi>();
  return {
    ...actual,
    getJoinedClassroom: vi.fn(),
    getJoinedClassroomSessions: vi.fn(),
  };
});

function detail(overrides: Partial<JoinedClassroomDetail> = {}): JoinedClassroomDetail {
  return {
    classroomId: 5,
    code: "10A1",
    name: "Grade 10 Algebra",
    description: null,
    status: "ACTIVE",
    teacherDisplayName: "Ms. Alpha",
    joinedAt: "2026-11-01T09:00:00Z",
    assignedSessionCount: 2,
    ...overrides,
  } satisfies JoinedClassroomDetail;
}

function learnerSession(overrides: Partial<LearnerClassroomSessionItem> = {}): LearnerClassroomSessionItem {
  return {
    sessionId: 41,
    code: "SES-11",
    title: "Midterm sitting",
    status: "SCHEDULED",
    startsAt: "2026-11-10T08:00:00Z",
    endsAt: "2026-11-10T10:00:00Z",
    examTitle: "Algebra",
    ...overrides,
  } satisfies LearnerClassroomSessionItem;
}

function pageOf(
  items: LearnerClassroomSessionItem[],
  extra: Partial<ClassroomSessionsPage<LearnerClassroomSessionItem>> = {}
): ClassroomSessionsPage<LearnerClassroomSessionItem> {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, sort: "startsAt,desc", ...extra };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MyClassesDetailPage />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getJoinedClassroom).mockResolvedValue(detail());
  vi.mocked(getJoinedClassroomSessions).mockResolvedValue(pageOf([learnerSession()]));
});

afterEach(cleanup);

describe("MyClassesDetailPage (CLASS-M2)", () => {
  it("renders the class overview with teacher and session count", async () => {
    mount();

    expect(await screen.findByText("Grade 10 Algebra")).toBeTruthy();
    expect(screen.getByText("10A1")).toBeTruthy();
    expect(screen.getByText(/Ms\. Alpha/)).toBeTruthy();
    expect(screen.getByText(/2 assigned sessions/i)).toBeTruthy();
  });

  it("lists assigned sessions across states and links to the landing route", async () => {
    vi.mocked(getJoinedClassroomSessions).mockResolvedValue(
      pageOf([
        learnerSession(),
        learnerSession({ sessionId: 42, title: "Past sitting", status: "CLOSED" }),
        learnerSession({ sessionId: 43, title: "Called off", status: "CANCELLED" }),
      ])
    );

    mount();

    expect(await screen.findByText("Midterm sitting")).toBeTruthy();
    expect(screen.getByText("Past sitting")).toBeTruthy();
    expect(screen.getByText("Called off")).toBeTruthy();
    // Landing links delegate start/resume/result decisions to the server.
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/sessions/41");
    const resultLinks = screen.getAllByRole("link", { name: "View result" });
    expect(resultLinks.map((a) => a.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/sessions/42", "/sessions/43"])
    );
  });

  it("renders the empty state when no sessions are assigned", async () => {
    vi.mocked(getJoinedClassroomSessions).mockResolvedValue(pageOf([]));

    mount();

    expect(await screen.findByText(/No sessions assigned to this class yet/i)).toBeTruthy();
  });

  it("renders the not-available card on 404 (non-member/left)", async () => {
    const err = Object.assign(new Error("404"), {
      kind: "api",
      code: "CLASSROOM_NOT_FOUND",
    });
    vi.mocked(getJoinedClassroom).mockRejectedValue(err);

    mount();

    expect(await screen.findByText(/Class not available/i)).toBeTruthy();
    expect(screen.getByText(/not a member of this class/i)).toBeTruthy();
  });

  it("renders the error state on transport failure", async () => {
    vi.mocked(getJoinedClassroom).mockRejectedValue(new Error("network"));

    mount();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("paginates assigned sessions (fetch contract)", async () => {
    vi.mocked(getJoinedClassroomSessions).mockResolvedValue(
      pageOf([learnerSession({ sessionId: 41, title: "Page One Session" })], {
        totalElements: 2,
        totalPages: 2,
      })
    );

    mount();
    expect(await screen.findByText("Page One Session")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();

    // Next drives the paged query to page 1.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(getJoinedClassroomSessions).toHaveBeenLastCalledWith(5, { page: 1, size: 20 }));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  });

  it("offers the My Results tab as a URL-param deep link (CLASS-M3)", async () => {
    mount();

    expect(await screen.findByRole("tab", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "My Results" }));
    expect(routerReplace).toHaveBeenCalledWith("?tab=results", { scroll: false });
    routerReplace.mockClear();
  });
});
