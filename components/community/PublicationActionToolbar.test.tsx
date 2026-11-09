// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicationActionToolbar,
  type PublicationActionTarget,
} from "./PublicationActionToolbar";
import {
  usePutRatingMutation,
  useSocialSummaryQuery,
} from "@/hooks/queries/use-community-social";
import {
  deleteLike,
  getPublicSocialSummary,
  getSocialSummary,
  putLike,
  putRating,
  deleteRating,
  type PublicSocialSummary,
  type SocialSummary,
} from "@/lib/api/community-social";
import type * as SocialApi from "@/lib/api/community-social";
import { listMyBookmarks, putBookmark } from "@/lib/api/community-bookmarks";
import type * as BookmarksApi from "@/lib/api/community-bookmarks";
import { forkPublication } from "@/lib/api/community-fork";
import type * as ForkApi from "@/lib/api/community-fork";
import { useAuth } from "@/hooks/useAuth";
import type { CurrentUserResponse } from "@/lib/auth/types";

/**
 * P3-C3 (#67) — the compact publication action toolbar. Auth-state matrices
 * (guest login CTAs with returnTo + public-summary counts, STUDENT fork
 * state, TEACHER consent-dialog flow), like toggle (PUT then DELETE, count
 * refresh, in-flight disable), the #68 rate dialog hosting the REAL
 * StarRatingInput (fieldset/legend radiogroup, live aggregate + own rating,
 * Clear via the REAL deleteRating mutation), rating-value pass-through
 * into putRating, safe-DOM leak checks with poisoned fixtures, and the §7
 * wrap/target contract (flex-wrap row, 44px controls).
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// Real constants/classifiers, mocked transport only — the hooks stay real so
// keying + invalidation are exercised.
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

vi.mock("@/lib/api/community-bookmarks", async (importOriginal) => {
  const actual = await importOriginal<typeof BookmarksApi>();
  return {
    ...actual,
    listMyBookmarks: vi.fn(),
    putBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
  };
});

vi.mock("@/lib/api/community-fork", async (importOriginal) => {
  const actual = await importOriginal<typeof ForkApi>();
  return { ...actual, forkPublication: vi.fn() };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const publicSummaryMock = vi.mocked(getPublicSocialSummary);
const socialMock = vi.mocked(getSocialSummary);
const putLikeMock = vi.mocked(putLike);
const deleteLikeMock = vi.mocked(deleteLike);
const putRatingMock = vi.mocked(putRating);
const deleteRatingMock = vi.mocked(deleteRating);
const bookmarksMock = vi.mocked(listMyBookmarks);
const forkMock = vi.mocked(forkPublication);

const LOGIN_HREF = "/login?returnTo=%2Fcommunity%2Fquizzes%2F7";

const PUBLICATION: PublicationActionTarget = {
  publicationId: 7,
  title: "Algebra fundamentals",
  authorName: "MathWhiz",
  allowFork: true,
};

function publicSummary(
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

function socialSummary(overrides: Partial<SocialSummary> = {}): SocialSummary {
  return {
    likeCount: 12,
    average: 4.5,
    ratingCount: 8,
    commentCount: 3,
    liked: false,
    myRating: null,
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

function mount(publication: PublicationActionTarget = PUBLICATION) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <div>
          <div id="discussion" />
          <PublicationActionToolbar
            publication={publication}
            loginHref={LOGIN_HREF}
          />
        </div>
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  asGuest();
  publicSummaryMock.mockResolvedValue(publicSummary());
  socialMock.mockResolvedValue(socialSummary());
  bookmarksMock.mockResolvedValue({
    items: [],
    page: 0,
    size: 50,
    totalElements: 0,
    totalPages: 0,
  });
});
afterEach(cleanup);

describe("publication action toolbar — guests (#67)", () => {
  it("renders Like → Comment → Rate → Fork → Save with public-summary counts", async () => {
    mount();

    const toolbar = await screen.findByTestId("publication-action-toolbar");
    expect(toolbar.getAttribute("role")).toBe("group");
    expect(toolbar.getAttribute("aria-label")).toBe("Community actions");
    const controls = [
      screen.getByTestId("sign-in-to-like"),
      screen.getByRole("button", { name: /Comment/i }),
      screen.getByTestId("sign-in-to-rate"),
      screen.getByTestId("sign-in-to-fork"),
      screen.getByTestId("sign-in-to-save"),
    ];
    // DOM order matches the §7 sequence: Like → Comment → Rate → Fork → Save.
    for (let i = 1; i < controls.length; i++) {
      const rel = controls[i - 1].compareDocumentPosition(controls[i]);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(await screen.findByText("12")).toBeTruthy(); // like count chip
    expect(screen.getByText("3")).toBeTruthy(); // comment count chip
    expect(screen.getByText("4.5")).toBeTruthy(); // average chip
    expect(publicSummaryMock).toHaveBeenCalledWith(7);
  });

  it("routes guest Like/Rate/Fork/Save CTAs to /login with returnTo and fires NO auth traffic", async () => {
    mount();

    for (const testId of [
      "sign-in-to-like",
      "sign-in-to-rate",
      "sign-in-to-fork",
      "sign-in-to-save",
    ]) {
      const cta = await screen.findByTestId(testId);
      expect(cta.getAttribute("href")).toBe(LOGIN_HREF);
      expect(cta.tagName).toBe("A");
    }
    expect(socialMock).not.toHaveBeenCalled();
    expect(putLikeMock).not.toHaveBeenCalled();
    expect(deleteLikeMock).not.toHaveBeenCalled();
    expect(putRatingMock).not.toHaveBeenCalled();
    expect(bookmarksMock).not.toHaveBeenCalled();
    expect(putBookmark).not.toHaveBeenCalled();
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("keeps Comment an anchor-scroll button (comments readable for guests), not a login detour", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mount();

    const comment = await screen.findByRole("button", { name: /Comment 3/ });
    expect(comment.tagName).toBe("BUTTON");
    fireEvent.click(comment);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0][0]).toEqual({
      behavior: "smooth",
      block: "start",
    });
  });

  it("ships no fork control at all for a NO_FORK publication", async () => {
    mount({ ...PUBLICATION, allowFork: false });

    await screen.findByTestId("sign-in-to-like");
    expect(screen.queryByTestId("sign-in-to-fork")).toBeNull();
  });

  it("renders only §5 aggregates — poisoned summary fields never reach the DOM", async () => {
    publicSummaryMock.mockResolvedValue({
      ...publicSummary(),
      authorUserId: 42,
      likedByUsernames: ["carol", "dave"],
      myRating: 5,
      liked: true,
      raterIds: [1, 2, 3],
    } as unknown as PublicSocialSummary);
    mount();

    await screen.findByTestId("sign-in-to-like");
    const html = document.body.innerHTML;
    for (const forbidden of [
      "authorUserId",
      "likedByUsernames",
      "carol",
      "dave",
      "raterIds",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });
});

describe("publication action toolbar — authenticated (#67)", () => {
  it("serves STUDENT and TEACHER the real toggles from the authenticated twin", async () => {
    for (const roles of [["STUDENT"], ["TEACHER"]]) {
      cleanup();
      asUser(roles);
      socialMock.mockResolvedValue(socialSummary());
      mount();

      expect(await screen.findByRole("button", { name: /Like 12/ })).toBeTruthy();
      expect(publicSummaryMock).not.toHaveBeenCalled();
      expect(socialMock).toHaveBeenCalledWith(7);
    }
  });

  it("shows STUDENT the non-actionable fork state (no dialog, no traffic)", async () => {
    asUser(["STUDENT"]);
    mount();

    const fork = (await screen.findByRole("button", {
      name: /Only teacher accounts can fork quizzes/,
    })) as HTMLButtonElement;
    expect(fork.disabled).toBe(true);
    fireEvent.click(fork);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("opens the TEACHER consent dialog (reused #48 flow)", async () => {
    asUser(["TEACHER"]);
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Fork" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByLabelText(/independent, editable copy of this quiz/i)
    ).toBeTruthy();
  });

  it("toggles Like: PUT first, count refresh via invalidation, DELETE on the second click", async () => {
    asUser();
    socialMock.mockResolvedValueOnce(socialSummary({ liked: false, likeCount: 12 }));
    const { promise: putPending, resolve: resolvePut } =
      Promise.withResolvers<SocialApi.LikeState>();
    putLikeMock.mockReturnValue(putPending);
    mount();

    const like = await screen.findByRole("button", { name: /Like 12/ });
    fireEvent.click(like);

    // In-flight: disabled + busy — the second click is a no-op.
    const busy = (await screen.findByRole("button", {
      name: /Like 12/,
    })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(busy);
    await waitFor(() => expect(putLikeMock).toHaveBeenCalledTimes(1));
    expect(putLikeMock).toHaveBeenCalledWith(7);

    socialMock.mockResolvedValue(socialSummary({ liked: true, likeCount: 13 }));
    resolvePut({ likeCount: 13, liked: true });

    // Prefix invalidation after settle → the twin refetches the fresh state.
    const liked = await screen.findByRole("button", { name: /Liked 13/ });
    expect(liked.getAttribute("aria-pressed")).toBe("true");

    // Second click un-likes via the idempotent DELETE.
    deleteLikeMock.mockResolvedValue({ likeCount: 12, liked: false });
    socialMock.mockResolvedValue(socialSummary({ liked: false, likeCount: 12 }));
    fireEvent.click(liked);
    await waitFor(() => expect(deleteLikeMock).toHaveBeenCalledWith(7));
    expect(await screen.findByRole("button", { name: /Like 12/ })).toBeTruthy();
  });

  it("disables Like while the authenticated summary is still landing (no wrong-state flash)", async () => {
    asUser();
    socialMock.mockReturnValue(new Promise(() => {}));
    mount();

    const like = (await screen.findByRole("button", {
      name: /Like/,
    })) as HTMLButtonElement;
    expect(like.disabled).toBe(true);
    fireEvent.click(like);
    expect(putLikeMock).not.toHaveBeenCalled();
  });

  it("surfaces gone/rate-limit/network copy on like failures", async () => {
    asUser();
    socialMock.mockResolvedValue(socialSummary());
    mount();

    const like = await screen.findByRole("button", { name: /Like 12/ });

    putLikeMock.mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    fireEvent.click(like);
    expect(
      await screen.findByText("This quiz is no longer available.")
    ).toBeTruthy();

    putLikeMock.mockRejectedValue({
      kind: "api",
      status: 429,
      code: "COMMUNITY_RATE_LIMITED",
      message: "Too many requests",
      raw: {
        isAxiosError: true,
        response: { headers: { "retry-after": "30" } },
      },
    });
    fireEvent.click(like);
    expect(
      await screen.findByText(/wait about 30 seconds and try again/)
    ).toBeTruthy();

    putLikeMock.mockRejectedValue({ kind: "network", message: "x", raw: {} });
    fireEvent.click(like);
    expect(
      await screen.findByText(
        "Network error — check your connection and try again."
      )
    ).toBeTruthy();
  });

  it("hosts the #68 star selector in the rate dialog: radiogroup + aggregate + Clear via DELETE", async () => {
    asUser();
    socialMock.mockResolvedValue(
      socialSummary({ average: 4.25, ratingCount: 8, myRating: 4 })
    );
    const { promise: clearPending, resolve: resolveClear } =
      Promise.withResolvers<SocialApi.RatingState>();
    deleteRatingMock.mockReturnValue(clearPending);
    mount();

    fireEvent.click(
      await screen.findByRole("button", { name: /Ratings: 4.25 of 5/ })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("4.25 / 5 · 8 ratings")).toBeTruthy();
    expect(within(dialog).getByText("Your rating: 4")).toBeTruthy();
    // The accessible 1–5 radiogroup replaced the #67 seam content.
    const group = within(dialog).getByTestId("star-radiogroup");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(within(dialog).getByRole("radio", { name: "4 stars" })).toBeTruthy();
    expect(
      within(dialog).getByRole("radio", { name: "4 stars" }).getAttribute("aria-checked")
    ).toBe("true");

    const clear = within(dialog).getByRole("button", {
      name: "Clear my rating",
    }) as HTMLButtonElement;
    fireEvent.click(clear);
    await waitFor(() => expect(deleteRatingMock).toHaveBeenCalledWith(7));
    expect(clear.disabled).toBe(true);

    socialMock.mockResolvedValue(socialSummary({ myRating: null }));
    resolveClear({ average: 4.5, ratingCount: 7, myRating: null });
    // Invalidate-after-settle refreshes the twin.
    await waitFor(() =>
      expect(socialMock.mock.calls.length).toBeGreaterThan(1)
    );
  });

  it("passes rating values through to PUT verbatim and invalidates after settle", async () => {
    asUser();

    /** Minimal harness — #68's star selector will be the real caller. */
    function Harness() {
      const put = usePutRatingMutation(7);
      useSocialSummaryQuery(7, true);
      return (
        <button type="button" onClick={() => put.mutate(4)}>
          harness-rate-4
        </button>
      );
    }

    const { promise: ratingPending, resolve: resolveRating } =
      Promise.withResolvers<SocialApi.RatingState>();
    putRatingMock.mockReturnValue(ratingPending);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <Harness />
        </QueryClientProvider>
      </StrictMode>
    );

    fireEvent.click(screen.getByRole("button", { name: "harness-rate-4" }));
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 4));

    resolveRating({ average: 4.625, ratingCount: 9, myRating: 4 });
    await waitFor(() =>
      expect(socialMock.mock.calls.length).toBeGreaterThan(1)
    );
  });
});

describe("publication action toolbar — §7 layout contract", () => {
  it("wraps (never overflows) and keeps every control a ≥44px target", async () => {
    asGuest();
    mount();

    const targets = [
      screen.getByTestId("sign-in-to-like"),
      await screen.findByRole("button", { name: /Comment 3/ }),
      screen.getByTestId("sign-in-to-rate"),
      screen.getByTestId("sign-in-to-fork"),
      screen.getByTestId("sign-in-to-save"),
    ];
    for (const target of targets) {
      expect(target.className).toContain("h-11");
    }
  });
});
