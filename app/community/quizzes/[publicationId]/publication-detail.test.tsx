// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicationDetailPage from "./page";
import {
  getPublicPublication,
  type PublicPublicationDetail,
} from "@/lib/api/community";
import {
  deleteBookmark,
  listMyBookmarks,
  putBookmark,
  type BookmarkPage,
} from "@/lib/api/community-bookmarks";
import type * as BookmarksApi from "@/lib/api/community-bookmarks";
import {
  getPublicSocialSummary,
  getSocialSummary,
  putLike,
  type PublicSocialSummary,
} from "@/lib/api/community-social";
import type * as SocialApi from "@/lib/api/community-social";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import type { CurrentUserResponse } from "@/lib/auth/types";

/**
 * P3-A-FE1 (#43) + P3-B1-FE (#46) + P3-C3 (#67) — public quiz detail.
 * Anonymous (AuthProvider-less tree), safe-DOM assertions for the §7
 * allowlist, 404 anti-enumeration state, the guest login CTAs carrying
 * `returnTo` with ZERO authenticated traffic, the guest-visible rating
 * aggregate + discussion heading fed by the ANONYMOUS social-summary, and
 * the authenticated explicit-loading Save/Remove toggle (now in the compact
 * toolbar): idempotent double-click (disabled while in flight),
 * invalidation refetch of the shared bookmark keys, 404-on-save and 429
 * copy. The like/rate/fork matrices live in
 * PublicationActionToolbar.test.tsx and publication-detail-fork.test.tsx.
 */

const { state } = vi.hoisted(() => ({ state: { id: "7" } }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ publicationId: state.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/community",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api/community", () => ({
  listPublicPublications: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicTags: vi.fn(),
  getPublicPublication: vi.fn(),
}));

// Real constants/classifier, mocked transport only (the hooks stay real so
// keying + invalidation are exercised).
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

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

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
    tags: ["algebra", "grade-10"],
    questionCount: 12,
    sectionCount: 3,
    durationMinutes: 30,
    publishedAt: "2026-11-01T10:00:00Z",
    allowFork: true,
    updatedAt: "2026-11-02T10:00:00Z",
    ...overrides,
  };
}

/** A `GET /me/bookmarks` page whose items save the given publication ids. */
function savedPage(ids: number[] = []): BookmarkPage {
  return {
    items: ids.map((publicationId) => ({
      publicationId,
      title: "Algebra fundamentals",
      summary: null,
      authorName: "MathWhiz",
      categoryCode: "TOAN",
      categoryTitle: "Mathematics",
      tags: [],
      questionCount: 12,
      sectionCount: 3,
      durationMinutes: 30,
      publishedAt: "2026-11-01T10:00:00Z",
      allowFork: false,
      savedAt: "2026-11-05T10:00:00Z",
      unavailable: false,
    })),
    page: 0,
    size: 50,
    totalElements: ids.length,
    totalPages: 1,
  };
}

function socialSummary(
  overrides: Partial<PublicSocialSummary> = {}
): PublicSocialSummary {
  return {
    likeCount: 12,
    average: 4.5,
    ratingCount: 8,
    commentCount: 3,
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

function asUser(roles: string[] = ["STUDENT"]) {
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
  vi.mocked(getPublicSocialSummary).mockResolvedValue(socialSummary());
  vi.mocked(getSocialSummary).mockResolvedValue({
    ...socialSummary(),
    liked: false,
    myRating: null,
  });
});
afterEach(cleanup);

describe("community publication detail page — guests (#43)", () => {
  it("renders the safe detail fields for a guest", async () => {
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    mount();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Algebra fundamentals" })
    ).toBeTruthy();
    expect(screen.getByText("MathWhiz")).toBeTruthy();
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("algebra")).toBeTruthy();
    expect(screen.getByText("grade-10")).toBeTruthy();
    // "12"/"3" also appear as toolbar chips (#67) — assert presence, not count.
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getByText(/30 min/)).toBeTruthy();
    expect(screen.getByText(/Published/)).toBeTruthy();
    expect(screen.getByText(/Updated/)).toBeTruthy();
    expect(getPublicPublication).toHaveBeenCalledWith(7);
  });

  it("keeps the login CTAs' returnTo pointing back at this page and fires NO bookmark/social-auth calls", async () => {
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    mount();

    const cta = await screen.findByRole("link", { name: "Sign in to save" });
    const href = cta.getAttribute("href") ?? "";
    expect(href.startsWith("/login?returnTo=")).toBe(true);
    const returnTo = sanitizeReturnTo(
      new URLSearchParams(href.slice("/login".length)).get("returnTo")
    );
    expect(returnTo).toBe("/community/quizzes/7");
    // #46/#67: guests never touch the authenticated bookmark/social routes.
    expect(listMyBookmarks).not.toHaveBeenCalled();
    expect(putBookmark).not.toHaveBeenCalled();
    expect(deleteBookmark).not.toHaveBeenCalled();
    expect(getSocialSummary).not.toHaveBeenCalled();
    expect(putLike).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders only the §7 allowlist — no answer/option/exam-id/PII keys in the DOM", async () => {
    const poisoned = {
      ...detail(),
      answerKey: "B",
      isCorrect: true,
      optionKey: "B",
      optionContent: "sneaky option text",
      examId: 99,
      sourceExamId: 99,
      email: "author@example.com",
      username: "secret-username",
      publisherUserId: 42,
      displayName: "Secret Display",
    } as unknown as PublicPublicationDetail;
    vi.mocked(getPublicPublication).mockResolvedValue(poisoned);
    mount();

    await screen.findByRole("heading", { level: 1, name: "Algebra fundamentals" });
    const html = document.body.innerHTML;
    for (const forbidden of [
      "answerKey",
      "answer_key",
      "isCorrect",
      "optionKey",
      "optionContent",
      "sneaky option text",
      "examId",
      "sourceExamId",
      "author@example.com",
      "secret-username",
      "Secret Display",
      "publisherUserId",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("shows the neutral not-available state on 404 (anti-enumeration)", async () => {
    vi.mocked(getPublicPublication).mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mount();

    expect(await screen.findByText("This quiz isn't available")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Algebra fundamentals" })
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Browse the community" }).getAttribute("href")
    ).toBe("/community");
  });

  it("shows the not-available state for an invalid id without calling the API", () => {
    state.id = "not-a-number";
    mount();
    expect(screen.getByText("This quiz isn't available")).toBeTruthy();
    expect(getPublicPublication).not.toHaveBeenCalled();
    expect(listMyBookmarks).not.toHaveBeenCalled();
  });

  it("shows a busy skeleton while the detail loads", async () => {
    vi.mocked(getPublicPublication).mockReturnValue(new Promise(() => {}));
    mount();
    const status = await screen.findByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
  });

  it("shows a role=alert error state on network failure", async () => {
    vi.mocked(getPublicPublication).mockRejectedValue({
      kind: "network",
      message: "offline",
      raw: {},
    });
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
  });
});

describe("community publication detail page — social aggregates (#67)", () => {
  it("renders the guest-visible rating aggregate from the ANONYMOUS summary", async () => {
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    mount();

    expect(
      await screen.findByText("4.5 / 5 · 8 ratings")
    ).toBeTruthy();
    expect(getPublicSocialSummary).toHaveBeenCalledWith(7);
    expect(getSocialSummary).not.toHaveBeenCalled();
  });

  it("renders '—' for a null average (zero ratings) with the live count", async () => {
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(getPublicSocialSummary).mockResolvedValue(
      socialSummary({ average: null, ratingCount: 0, likeCount: 0, commentCount: 0 })
    );
    mount();

    expect(await screen.findByText("— / 5 · 0 ratings")).toBeTruthy();
  });

  it("feeds the discussion heading the live comment count via the #discussion anchor", async () => {
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    mount();

    const heading = await screen.findByRole("heading", {
      level: 2,
      name: "Community Discussion (3)",
    });
    expect(heading.closest("section")?.id).toBe("discussion");
  });

  it("serves signed-in users the authenticated twin for aggregates", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(getSocialSummary).mockResolvedValue({
      ...socialSummary({ average: 4.25 }),
      liked: true,
      myRating: 4,
    });
    mount();

    expect(await screen.findByText("4.25 / 5 · 8 ratings")).toBeTruthy();
    expect(getPublicSocialSummary).not.toHaveBeenCalled();
    expect(getSocialSummary).toHaveBeenCalledWith(7);
  });
});

describe("community publication detail page — save/unsave toggle (#46)", () => {
  it("derives the save-state from the newest-first probe (same key family as the collection page)", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([7]));
    mount();

    const saved = (await screen.findByRole("button", {
      name: "Saved",
    })) as HTMLButtonElement;
    expect(saved.getAttribute("aria-pressed")).toBe("true");
    expect(listMyBookmarks).toHaveBeenCalledWith({ page: 0, size: 50 });
  });

  it("serves STUDENT and TEACHER identically (one shared collection)", async () => {
    for (const roles of [["STUDENT"], ["TEACHER"], ["STUDENT", "TEACHER"]]) {
      cleanup();
      asUser(roles);
      vi.mocked(getPublicPublication).mockResolvedValue(detail());
      vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([7]));
      mount();
      expect(
        await screen.findByRole("button", { name: "Saved" })
      ).toBeTruthy();
    }
  });

  it("disables the toggle with a Checking state while the probe loads", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockReturnValue(new Promise(() => {}));
    mount();

    const button = (await screen.findByRole("button", {
      name: /Checking…/,
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(putBookmark).not.toHaveBeenCalled();
  });

  it("saves via PUT with explicit loading, single call under double-click, and invalidation refetch", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([]));
    const { promise: putPending, resolve: resolvePut } =
      Promise.withResolvers<void>();
    vi.mocked(putBookmark).mockReturnValue(putPending);
    mount();

    const save = await screen.findByRole("button", { name: "Save" });
    fireEvent.click(save);

    // In-flight: disabled + labelled, so the second click is a no-op (and the
    // backend PUT is idempotent even if a stray request slipped through).
    const busy = (await screen.findByRole("button", {
      name: /Saving…/,
    })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(busy);
    // TanStack defers mutationFn to a microtask — await the single call
    // (the disabled second click above must not add a second one).
    await waitFor(() => expect(putBookmark).toHaveBeenCalledTimes(1));
    expect(putBookmark).toHaveBeenCalledWith(7);

    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([7]));
    resolvePut();

    expect(await screen.findByText("Saved to your collection.")).toBeTruthy();
    // Shared-key invalidation after settle — the probe (and any other tab or
    // surface holding the same query) refetches the fresh state.
    await waitFor(() =>
      expect(vi.mocked(listMyBookmarks).mock.calls.length).toBeGreaterThan(1)
    );
  });

  it("removes via DELETE with explicit loading and success notice", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([7]));
    const { promise: deletePending, resolve: resolveDelete } =
      Promise.withResolvers<void>();
    vi.mocked(deleteBookmark).mockReturnValue(deletePending);
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Saved" }));

    const busy = (await screen.findByRole("button", {
      name: /Removing…/,
    })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    await waitFor(() => expect(deleteBookmark).toHaveBeenCalledTimes(1));
    expect(deleteBookmark).toHaveBeenCalledWith(7);

    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([]));
    resolveDelete();

    expect(await screen.findByText("Removed from your collection.")).toBeTruthy();
    await waitFor(() =>
      expect(vi.mocked(listMyBookmarks).mock.calls.length).toBeGreaterThan(1)
    );
  });

  it("surfaces 'no longer available' when the save hits a 404 (§4 predicate)", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([]));
    vi.mocked(putBookmark).mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no longer available");
  });

  it("surfaces the §9 rate-limit copy on 429", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([]));
    vi.mocked(putBookmark).mockRejectedValue({
      kind: "api",
      status: 429,
      code: "COMMUNITY_RATE_LIMITED",
      message: "Too many requests",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many requests");
  });

  it("surfaces the network copy when offline", async () => {
    asUser();
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    vi.mocked(listMyBookmarks).mockResolvedValue(savedPage([]));
    vi.mocked(putBookmark).mockRejectedValue({
      kind: "network",
      message: "offline",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
  });
});
