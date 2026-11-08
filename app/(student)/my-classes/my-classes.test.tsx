// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyClassesPage from "./page";
import {
  getJoinedClassrooms,
  getMyRosterInvitations,
  leaveClassroom,
  type JoinedClassroomResponse,
  type JoinedClassroomsPage,
  type RosterEntryResponse,
} from "@/lib/api/classrooms";
import type * as ClassroomsApi from "@/lib/api/classrooms";

/**
 * CLASS-M1 (#50) — Student My Classes reads the JOINED membership endpoint
 * (classroom_members truth): multi-teacher memberships from any enrollment
 * source render one card each (name + teacher, not "Class #id"), archived
 * status is visible, invitations stay a separate consent section, Leave is
 * confirm-gated and settles into cache invalidation, and paged results get
 * page navigation. Loading/empty/error states included.
 */

// Real types/classifier, mocked transport only.
vi.mock("@/lib/api/classrooms", async (importOriginal) => {
  const actual = await importOriginal<typeof ClassroomsApi>();
  return {
    ...actual,
    getJoinedClassrooms: vi.fn(),
    getMyRosterInvitations: vi.fn(),
    leaveClassroom: vi.fn(),
  };
});

function joinedClass(overrides: Partial<JoinedClassroomResponse> = {}): JoinedClassroomResponse {
  return {
    classroomId: 11,
    code: "10A1",
    name: "Grade 10 Algebra",
    description: null,
    status: "ACTIVE",
    teacherDisplayName: "Ms. Alpha",
    joinedAt: "2026-11-01T09:00:00Z",
    ...overrides,
  } satisfies JoinedClassroomResponse;
}

function pageOf(
  items: JoinedClassroomResponse[],
  extra: Partial<JoinedClassroomsPage> = {}
): JoinedClassroomsPage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: 1,
    sort: "joinedAt,desc",
    ...extra,
  };
}

function invitation(overrides: Partial<RosterEntryResponse> = {}): RosterEntryResponse {
  return {
    id: 31,
    classroomId: 13,
    status: "PENDING",
    userId: null,
    fullName: "Learner One",
    studentNumber: null,
    gender: null,
    dob: null,
    phone: null,
    parentPhone: null,
    email: null,
    createdAt: "2026-11-05T09:00:00Z",
    linkedAt: null,
    classroomName: "Physics Club",
    teacherDisplayName: "Mr. Beta",
    ...overrides,
  } satisfies RosterEntryResponse;
}

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MyClassesPage />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMyRosterInvitations).mockResolvedValue([]);
  vi.mocked(leaveClassroom).mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MyClassesPage (CLASS-M1)", () => {
  it("renders one card per joined class across multiple teachers", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(
      pageOf([
        joinedClass({ classroomId: 11, name: "Grade 10 Algebra", teacherDisplayName: "Ms. Alpha" }),
        joinedClass({ classroomId: 12, name: "Chem Lab", teacherDisplayName: "Dr. Gamma" }),
      ])
    );

    mount();

    expect(await screen.findByText("Grade 10 Algebra")).toBeTruthy();
    expect(screen.getByText("Chem Lab")).toBeTruthy();
    expect(screen.getByText(/Teacher: Ms\. Alpha/)).toBeTruthy();
    expect(screen.getByText(/Teacher: Dr\. Gamma/)).toBeTruthy();
    // Both cards expose Leave (any enrollment source).
    expect(screen.getAllByRole("button", { name: "Leave class" })).toHaveLength(2);
  });

  it("shows the ARCHIVED badge for archived classes", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(
      pageOf([joinedClass({ status: "ARCHIVED" })])
    );

    mount();

    expect(await screen.findByText("ARCHIVED")).toBeTruthy();
    expect(screen.queryByText("ACTIVE")).toBeNull();
  });

  it("renders the empty state when no classes and no invitations exist", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(pageOf([]));

    mount();

    expect(
      await screen.findByText(/You have not joined any class yet/i)
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave class" })).toBeNull();
  });

  it("renders the error state on transport failure", async () => {
    vi.mocked(getJoinedClassrooms).mockRejectedValue(new Error("network"));

    mount();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Could not load your classes/i);
  });

  it("renders the loading state before data arrives", () => {
    vi.mocked(getJoinedClassrooms).mockReturnValue(new Promise(() => undefined));

    mount();

    expect(screen.getByText(/Loading your classes/i)).toBeTruthy();
  });

  it("lists pending invitations in a separate consent section with class identity", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(pageOf([]));
    vi.mocked(getMyRosterInvitations).mockResolvedValue([invitation()]);

    mount();

    expect(await screen.findByText("Physics Club")).toBeTruthy();
    expect(screen.getByText(/Teacher: Mr\. Beta/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join class" })).toBeTruthy();
    // Invitation section is separate from the (empty) joined list.
    expect(screen.queryByText(/You have not joined any class yet/i)).toBeNull();
  });

  it("leaves a class only after confirmation and calls the joined-based endpoint", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(pageOf([joinedClass({ classroomId: 11 })]));

    mount();
    const leaveButton = await screen.findByRole("button", { name: "Leave class" });
    fireEvent.click(leaveButton);

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Grade 10 Algebra")
    );
    await waitFor(() => expect(leaveClassroom).toHaveBeenCalledWith(11));
  });

  it("does not leave when the confirmation is cancelled", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(pageOf([joinedClass({ classroomId: 11 })]));
    vi.mocked(window.confirm).mockReturnValue(false);

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Leave class" }));

    expect(leaveClassroom).not.toHaveBeenCalled();
  });

  it("surfaces a leave error instead of failing silently", async () => {
    vi.mocked(getJoinedClassrooms).mockResolvedValue(pageOf([joinedClass({ classroomId: 11 })]));
    vi.mocked(leaveClassroom).mockRejectedValue(new Error("404 race"));

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Leave class" }));

    expect(await screen.findByTestId("leave-error")).toBeTruthy();
  });

  it("navigates pages of joined classes", async () => {
    vi.mocked(getJoinedClassrooms).mockImplementation(async ({ page } = {}) =>
      pageOf(
        page === 0
          ? [joinedClass({ classroomId: 11, name: "Page One Class" })]
          : [joinedClass({ classroomId: 12, name: "Page Two Class" })],
        { page: page ?? 0, totalPages: 2, totalElements: 2 }
      )
    );

    mount();
    expect(await screen.findByText("Page One Class")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page Two Class")).toBeTruthy();
    expect(getJoinedClassrooms).toHaveBeenLastCalledWith({ page: 1, size: 20 });
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("clamps back to the last valid page when totalPages shrinks", async () => {
    // Page 0: two pages. After navigating to page 1, the refetched data
    // reports only ONE page (e.g. the last card was just left) — the
    // component must clamp back to page 0 instead of stranding on an
    // empty over-paged view.
    let pageZeroCalls = 0;
    vi.mocked(getJoinedClassrooms).mockImplementation(async ({ page } = {}) => {
      if ((page ?? 0) === 0) {
        pageZeroCalls++;
        const totalPages = pageZeroCalls === 1 ? 2 : 1; // shrinks after Next
        return pageOf(
          [joinedClass({ classroomId: 11, name: "Shrunk List Class" })],
          { page: 0, totalPages, totalElements: 1 }
        );
      }
      return pageOf([], { page: 1, totalPages: 1, totalElements: 1 });
    });

    mount();
    expect(await screen.findByText("Shrunk List Class")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Clamped back to page 0: the class card stays visible, the nav
    // settles to hidden (single page) and the false empty state never
    // renders.
    expect(await screen.findByText("Shrunk List Class")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Next" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByText(/You have not joined any class yet/i)).toBeNull();
  });
});
