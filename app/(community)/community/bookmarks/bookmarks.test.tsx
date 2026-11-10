// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavedQuizzesPage from "./page";
import {
  deleteBookmark,
  listMyBookmarks,
  type BookmarkPage,
} from "@/lib/api/community-bookmarks";
import type * as BookmarksApi from "@/lib/api/community-bookmarks";

/**
 * P3-B1-FE (#46) — the saved-collection page: available entries render the
 * §7 card allowlist + savedAt + Remove + a public-detail link; unavailable
 * entries render ONLY the generic placeholder + savedAt + Remove (a poisoned
 * fixture proves no stale title/alias/category/tags leak); Remove is an
 * explicit-loading idempotent DELETE whose settle invalidates the shared
 * bookmark keys (refetch); pagination drives the paged query.
 */

// Real constants/classifier, mocked transport only.
vi.mock("@/lib/api/community-bookmarks", async (importOriginal) => {
  const actual = await importOriginal<typeof BookmarksApi>();
  return {
    ...actual,
    listMyBookmarks: vi.fn(),
    deleteBookmark: vi.fn(),
  };
});

function available(overrides: Partial<BookmarksApi.SavedPublicationCard> = {}) {
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
    allowFork: false,
    savedAt: "2026-11-05T10:00:00Z",
    unavailable: false,
    ...overrides,
  } satisfies BookmarksApi.SavedPublicationCard;
}

function pageOf(
  items: BookmarksApi.BookmarkEntry[],
  extra: Partial<BookmarkPage> = {}
): BookmarkPage {
  return {
    items,
    page: 0,
    size: 12,
    totalElements: items.length,
    totalPages: 1,
    ...extra,
  };
}

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <SavedQuizzesPage />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(deleteBookmark).mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("/community/bookmarks", () => {
  it("shows a busy skeleton while the collection loads", async () => {
    vi.mocked(listMyBookmarks).mockReturnValue(new Promise(() => {}));
    mount();

    const status = await screen.findByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
  });

  it("shows a role=alert error state on failure", async () => {
    vi.mocked(listMyBookmarks).mockRejectedValue({
      kind: "network",
      message: "offline",
      raw: {},
    });
    mount();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
  });

  it("shows the empty state with a browse CTA", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([]));
    mount();

    expect(await screen.findByText("No saved quizzes yet")).toBeTruthy();
    // Both the header back-link and the empty-state CTA point at /community.
    const browse = screen.getAllByRole("link", { name: "Browse the community" });
    expect(browse).toHaveLength(2);
    for (const link of browse) expect(link.getAttribute("href")).toBe("/community");
  });

  it("#71: keeps only the header back-link, no tab row, fully dark heading", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([available()]));
    mount();

    await screen.findByRole("link", { name: "Algebra fundamentals" });
    expect(screen.queryByRole("navigation")).toBeNull();
    // Fully dark heading: no gradient-text span on the second word.
    const h1 = screen.getByRole("heading", { level: 1, name: "Saved quizzes" });
    expect(h1.textContent).toBe("Saved quizzes");
    expect(h1.querySelector(".gradient-text")).toBeNull();
    // The header "Browse the community" link stays the one back shortcut
    // (the empty-state CTA only exists while the collection is empty).
    const browse = screen.getAllByRole("link", { name: "Browse the community" });
    expect(browse).toHaveLength(1);
    expect(browse[0].getAttribute("href")).toBe("/community");
  });

  it("renders available entries: card allowlist + savedAt + detail link + Remove", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([available()]));
    mount();

    const link = await screen.findByRole("link", { name: "Algebra fundamentals" });
    // #71 — card link carries the allowlisted saved-origin marker.
    expect(link.getAttribute("href")).toBe("/community/quizzes/7?from=saved");
    expect(screen.getByText("MathWhiz")).toBeTruthy();
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("algebra")).toBeTruthy();
    expect(screen.getByText(/12 questions/)).toBeTruthy();
    expect(screen.getByText(/Saved \d/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(listMyBookmarks).toHaveBeenCalledWith({ page: 0, size: 12 });
  });

  it("renders unavailable entries as the generic placeholder ONLY — no stale fields leak", async () => {
    // §7 ships {publicationId, savedAt, unavailable:true} only — but poison
    // the runtime payload to prove the component consumes nothing else.
    const poisoned = {
      publicationId: 9,
      savedAt: "2026-11-05T10:00:00Z",
      unavailable: true,
      title: "Stale Title",
      summary: "Stale summary text",
      authorName: "Stale Author",
      authorAlias: "Stale Alias",
      categoryCode: "STALE",
      categoryTitle: "Stale Category",
      tags: ["stale-tag"],
      questionCount: 999,
      allowFork: true,
    } as unknown as BookmarksApi.UnavailableBookmark;
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([poisoned]));
    mount();

    expect(await screen.findByText("This quiz is no longer available")).toBeTruthy();
    expect(screen.getByText(/Saved \d/)).toBeTruthy();
    const remove = screen.getByRole("button", { name: "Remove" });
    expect(remove).toBeTruthy();

    const html = document.body.innerHTML;
    for (const forbidden of [
      "Stale Title",
      "Stale summary text",
      "Stale Author",
      "Stale Alias",
      "Stale Category",
      "STALE",
      "stale-tag",
      "999",
    ]) {
      expect(html).not.toContain(forbidden);
    }
    // No detail link for an invisible publication (404 anti-enumeration).
    expect(document.querySelectorAll('a[href^="/community/quizzes/"]')).toHaveLength(0);
  });

  it("removes via DELETE with explicit loading, single call under double-click, and invalidation refetch", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([available()]));
    const { promise, resolve } = Promise.withResolvers<void>();
    vi.mocked(deleteBookmark).mockReturnValue(promise);
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    const busy = (await screen.findByRole("button", {
      name: /Removing…/,
    })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(busy);
    // TanStack defers mutationFn to a microtask — await the single call
    // (the disabled second click above must not add a second one).
    await waitFor(() => expect(deleteBookmark).toHaveBeenCalledTimes(1));
    expect(deleteBookmark).toHaveBeenCalledWith(7);

    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([]));
    resolve();

    expect(await screen.findByText("Removed from your collection.")).toBeTruthy();
    // Invalidation after settle — the active list query refetches.
    await waitFor(() =>
      expect(vi.mocked(listMyBookmarks).mock.calls.length).toBeGreaterThan(1)
    );
  });

  it("surfaces the 'no longer available' copy when a remove hits a 404", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([available()]));
    vi.mocked(deleteBookmark).mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no longer available");
  });

  it("surfaces the §9 rate-limit copy when a remove hits a 429", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(pageOf([available()]));
    vi.mocked(deleteBookmark).mockRejectedValue({
      kind: "api",
      status: 429,
      code: "COMMUNITY_RATE_LIMITED",
      message: "Too many requests",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many requests");
  });

  it("pages the collection (0-based, previous disabled on page 0)", async () => {
    vi.mocked(listMyBookmarks).mockResolvedValue(
      pageOf([available()], { page: 0, totalElements: 13, totalPages: 2 })
    );
    mount();

    expect(await screen.findByText(/13 saved quizzes/)).toBeTruthy();
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();

    const prev = screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(listMyBookmarks).toHaveBeenLastCalledWith({ page: 1, size: 12 })
    );
  });
});
