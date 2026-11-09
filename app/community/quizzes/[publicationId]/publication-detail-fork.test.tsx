// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicationDetailPage from "./page";
import {
  getPublicPublication,
  type PublicPublicationDetail,
} from "@/lib/api/community";
import { listMyBookmarks } from "@/lib/api/community-bookmarks";
import type * as BookmarksApi from "@/lib/api/community-bookmarks";
import { getPublicSocialSummary, getSocialSummary } from "@/lib/api/community-social";
import type * as SocialApi from "@/lib/api/community-social";
import { forkPublication } from "@/lib/api/community-fork";
import type * as ForkApi from "@/lib/api/community-fork";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import type { CurrentUserResponse } from "@/lib/auth/types";

/**
 * P3-B2-FE (#48) + #67 toolbar integration — fork gating on the public
 * detail page's compact toolbar: NO_FORK ships no fork control at all,
 * guests get the `returnTo` login CTA with zero fork traffic, STUDENT gets
 * the explanatory non-actionable state, TEACHER (incl. dual-role) runs the
 * full consent → 201 → attribution → /exams/{id} flow, and a 404 mid-flight
 * surfaces the neutral copy while the community tree invalidates (the #46
 * pattern). #43/#46/#67 assertions live in publication-detail.test.tsx and
 * PublicationActionToolbar.test.tsx.
 */

const { state } = vi.hoisted(() => ({ state: { id: "7" } }));
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ publicationId: state.id }),
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/community",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api/community", () => ({
  listPublicPublications: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicTags: vi.fn(),
  getPublicPublication: vi.fn(),
}));

// Real classifier/constants, mocked transport only.
vi.mock("@/lib/api/community-bookmarks", async (importOriginal) => {
  const actual = await importOriginal<typeof BookmarksApi>();
  return {
    ...actual,
    listMyBookmarks: vi.fn(),
    putBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
  };
});

vi.mock("@/lib/api/community-social", async (importOriginal) => {
  const actual = await importOriginal<typeof SocialApi>();
  return {
    ...actual,
    getPublicSocialSummary: vi.fn(),
    getSocialSummary: vi.fn(),
    putLike: vi.fn(),
    deleteLike: vi.fn(),
    putRating: vi.fn(),
    deleteRating: vi.fn(),
  };
});

vi.mock("@/lib/api/community-fork", async (importOriginal) => {
  const actual = await importOriginal<typeof ForkApi>();
  return { ...actual, forkPublication: vi.fn() };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const detailMock = vi.mocked(getPublicPublication);
const bookmarksMock = vi.mocked(listMyBookmarks);
const publicSocialMock = vi.mocked(getPublicSocialSummary);
const socialMock = vi.mocked(getSocialSummary);
const fork = vi.mocked(forkPublication);

function detail(
  overrides: Partial<PublicPublicationDetail> = {}
): PublicPublicationDetail {
  return {
    publicationId: 7,
    title: "Algebra fundamentals",
    summary: "Linear equations and inequalities.",
    authorName: "MathWhiz",
    categoryCode: "TOAN",
    categoryTitle: "Mathematics",
    tags: ["algebra"],
    questionCount: 12,
    sectionCount: 3,
    durationMinutes: 30,
    publishedAt: "2026-11-01T10:00:00Z",
    allowFork: true,
    updatedAt: "2026-11-02T10:00:00Z",
    ...overrides,
  };
}

const authedUser = (roles: string[]): CurrentUserResponse => ({
  id: 1,
  username: "ada",
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  status: "ACTIVE",
  emailVerified: true,
  googleLinked: false,
  roles,
  permissions: [],
});

function asGuest() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    status: "unauthenticated",
    isAuthenticated: false,
    isLoading: false,
  } as never);
}

function asUser(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: authedUser(roles),
    status: "authenticated",
    isAuthenticated: true,
    isLoading: false,
  } as never);
}

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <PublicationDetailPage />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  state.id = "7";
  asGuest();
  detailMock.mockResolvedValue(detail());
  bookmarksMock.mockResolvedValue({
    items: [],
    page: 0,
    size: 50,
    totalElements: 0,
    totalPages: 0,
  });
  publicSocialMock.mockResolvedValue({
    likeCount: 12,
    average: 4.5,
    ratingCount: 8,
    commentCount: 3,
  });
  socialMock.mockResolvedValue({
    likeCount: 12,
    average: 4.5,
    ratingCount: 8,
    commentCount: 3,
    liked: false,
    myRating: null,
  });
  push.mockReset();
});
afterEach(cleanup);

describe("public detail fork section (#48, via the #67 toolbar)", () => {
  it("renders NO fork control at all for a NO_FORK publication (any caller)", async () => {
    const setups: [string, () => void][] = [
      ["guest", asGuest],
      ["student", () => asUser(["STUDENT"])],
      ["teacher", () => asUser(["TEACHER"])],
    ];
    for (const [, setup] of setups) {
      cleanup();
      fork.mockClear();
      setup();
      detailMock.mockResolvedValue(detail({ allowFork: false }));
      mount();
      await screen.findByRole("heading", { level: 1, name: "Algebra fundamentals" });

      expect(screen.queryByTestId("sign-in-to-fork")).toBeNull();
      expect(
        screen.queryByRole("button", { name: /^Fork$/ })
      ).toBeNull();
      expect(
        screen.queryByRole("button", {
          name: /Only teacher accounts can fork quizzes/,
        })
      ).toBeNull();
      expect(fork).not.toHaveBeenCalled();
    }
  });

  it("gives guests a login CTA preserving returnTo and fires NO fork traffic", async () => {
    asGuest();
    mount();

    const cta = await screen.findByTestId("sign-in-to-fork");
    const href = cta.getAttribute("href") ?? "";
    expect(href.startsWith("/login?returnTo=")).toBe(true);
    expect(
      sanitizeReturnTo(
        new URLSearchParams(href.slice("/login".length)).get("returnTo")
      )
    ).toBe("/community/quizzes/7");
    expect(screen.queryAllByRole("button", { name: "Fork" })).toHaveLength(0);
    expect(fork).not.toHaveBeenCalled();
    expect(bookmarksMock).not.toHaveBeenCalled();
  });

  it("shows STUDENT the explanatory non-actionable state (no dialog, no calls)", async () => {
    asUser(["STUDENT"]);
    mount();

    const forkCta = (await screen.findByRole("button", {
      name: /Only teacher accounts can fork quizzes/,
    })) as HTMLButtonElement;
    expect(forkCta.disabled).toBe(true);
    fireEvent.click(forkCta);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fork).not.toHaveBeenCalled();
  });

  it("runs the TEACHER consent flow: dialog → 201 → attribution → /exams/{targetExamId}", async () => {
    asUser(["TEACHER"]);
    fork.mockResolvedValue({
      targetExamId: 501,
      sourcePublicationId: 7,
      sourceTitle: "Algebra fundamentals",
      authorAlias: "MathWhiz",
      forkedAt: "2026-11-08T10:00:00Z",
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Fork" }));
    const dialog = await screen.findByRole("dialog");

    // Explicit consent before the POST goes out (scoped: the page toolbar
    // button behind the modal no longer shares the confirm button's name).
    fireEvent.click(
      within(dialog).getByLabelText(/independent, editable copy of this quiz/i)
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Fork this quiz" }));

    expect(await screen.findByText("Your draft is ready")).toBeTruthy();
    expect(screen.getByText(/Forked from/i)).toBeTruthy();
    expect(fork).toHaveBeenCalledWith(7, expect.any(String));

    fireEvent.click(screen.getByRole("button", { name: "Open your draft" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/exams/501");
  });

  it("qualifies dual-role STUDENT+TEACHER callers as teachers", async () => {
    asUser(["STUDENT", "TEACHER"]);
    mount();

    expect(
      await screen.findByRole("button", { name: "Fork" })
    ).toBeTruthy();
  });

  it("treats a 404 mid-flight as 'no longer available' and invalidates the community tree", async () => {
    asUser(["TEACHER"]);
    fork.mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Fork" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByLabelText(/independent, editable copy of this quiz/i)
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Fork this quiz" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no longer available");

    // The mutation's 404 path invalidated ["community"] → the active detail
    // query refetches (fresh state, no stale fork CTA).
    await waitFor(() => expect(detailMock.mock.calls.length).toBeGreaterThan(1));
  });
});
