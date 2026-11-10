// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommunityPage from "./page";
import {
  listPublicCategories,
  listPublicPublications,
  listPublicTags,
  type PublicPublicationCard,
  type PublicPublicationPage,
} from "@/lib/api/community";

/**
 * P3-A-FE1 (#43) — public explore page. Module-mock style follows
 * app/auth/callback/callback.test.tsx (mocked next/navigation + lib/api, real
 * TanStack client). The mocked `state.query` is the committed URL: updating it
 * + rerender simulates router.push landing on a new query string.
 */

const { push, state } = vi.hoisted(() => ({
  push: vi.fn(),
  state: { query: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.query),
  usePathname: () => "/community",
}));

vi.mock("@/lib/api/community", () => ({
  listPublicPublications: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicTags: vi.fn(),
  getPublicPublication: vi.fn(),
}));

function card(
  overrides: Partial<PublicPublicationCard> = {}
): PublicPublicationCard {
  return {
    publicationId: 1,
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
    ...overrides,
  };
}

function pageOf(
  items: PublicPublicationCard[],
  totalPages = 1,
  totalElements = items.length
): PublicPublicationPage {
  return { items, page: 0, size: 12, totalElements, totalPages };
}

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (client: QueryClient) => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <CommunityPage />
      </QueryClientProvider>
    </StrictMode>
  );
  const view = render(tree(qc));
  return { rerender: () => view.rerender(tree(qc)) };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.query = "";
  vi.mocked(listPublicPublications).mockResolvedValue(pageOf([]));
  vi.mocked(listPublicCategories).mockResolvedValue([
    { id: 3, code: "TOAN", title: "Mathematics" },
  ]);
  vi.mocked(listPublicTags).mockResolvedValue([
    { label: "algebra", usageCount: 3 },
    { label: "geometry", usageCount: 1 },
  ]);
});
afterEach(cleanup);

describe("community explore page", () => {
  it("renders public catalog cards for guests (no auth in the tree)", async () => {
    vi.mocked(listPublicPublications).mockResolvedValue(
      pageOf([
        card(),
        card({
          publicationId: 2,
          title: "Geometry basics",
          authorName: "GeoGuru",
          tags: ["geometry"],
          allowFork: false,
          categoryTitle: null,
          categoryCode: null,
        }),
      ])
    );
    mount();

    // #71 — card links carry the allowlisted origin marker for the detail
    // page's contextual Back.
    const link = await screen.findByRole("link", { name: "Algebra fundamentals" });
    expect(link.getAttribute("href")).toBe("/community/quizzes/1?from=community");
    expect(
      screen.getByRole("link", { name: "Geometry basics" }).getAttribute("href")
    ).toBe("/community/quizzes/2?from=community");
    expect(screen.getAllByText("MathWhiz").length).toBe(1);
    expect(screen.getByText("GeoGuru")).toBeTruthy();
    expect(screen.getAllByText("Mathematics").length).toBe(2); // select option + card badge
    expect(screen.getByText("Uncategorised")).toBeTruthy();
    expect(screen.getByText("Forkable")).toBeTruthy();
    expect(screen.getAllByText(/12 questions/).length).toBe(2);
    expect(screen.getAllByText(/3 sections/).length).toBe(2);
    expect(screen.getAllByText(/30 min/).length).toBe(2);
    expect(listPublicPublications).toHaveBeenCalledWith({
      q: undefined,
      categoryId: undefined,
      tags: undefined,
      page: 0,
      size: 12,
    });
  });

  it("#71: heading row links to Saved quizzes; title fully dark; no tab row", async () => {
    mount();

    const saved = await screen.findByRole("link", { name: "Saved quizzes" });
    expect(saved.getAttribute("href")).toBe("/community/bookmarks");
    // The CommunitySectionNav tab row is gone — no secondary nav remains.
    expect(screen.queryByRole("navigation")).toBeNull();
    // Fully dark heading: single text node in text-[#0F172A], no gradient span.
    const h1 = screen.getByRole("heading", {
      level: 1,
      name: "Community quizzes",
    });
    expect(h1.textContent).toBe("Community quizzes");
    expect(h1.querySelector(".gradient-text")).toBeNull();
  });

  it("#71: tag chips are compact but keep button semantics (aria-pressed + focus ring)", async () => {
    state.query = "tags=algebra";
    mount();

    const chip = await screen.findByRole("button", { name: "algebra" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    // Visible chip shrunk to ~Badge height; h-9 keeps a real ≥36px hit area
    // (pseudo-elements cannot extend a button's clickable box) and the
    // keyboard focus-ring class is preserved.
    expect(chip.className).toContain("h-9");
    expect(chip.className).toContain("focus-visible:ring-2");
    expect(chip.className).not.toContain("h-11");
  });

  it("renders only the §7 allowlist — no answer/option/exam-id/PII keys in the DOM", async () => {
    const poisoned = {
      ...card(),
      answerKey: "B",
      answer_key: "B",
      isCorrect: true,
      optionKey: "B",
      optionContent: "sneaky option text",
      examId: 99,
      sourceExamId: 99,
      email: "author@example.com",
      username: "secret-username",
      publisherUserId: 42,
      displayName: "Secret Display",
    } as unknown as PublicPublicationCard;
    vi.mocked(listPublicPublications).mockResolvedValue(pageOf([poisoned]));
    mount();

    await screen.findByRole("link", { name: "Algebra fundamentals" });
    const html = document.body.innerHTML;
    for (const forbidden of [
      "answerKey",
      "answer_key",
      "isCorrect",
      "is_correct",
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

  it("deep-links: URL filters flow into the catalog query and chip state", async () => {
    state.query = "q=algebra&categoryId=3&tags=algebra&tags=geometry&page=2";
    vi.mocked(listPublicPublications).mockResolvedValue(pageOf([card()]));
    mount();

    await screen.findByRole("link", { name: "Algebra fundamentals" });
    expect(listPublicPublications).toHaveBeenCalledWith({
      q: "algebra",
      categoryId: 3,
      tags: ["algebra", "geometry"],
      page: 2,
      size: 12,
    });
    expect(
      screen.getByRole("button", { name: "algebra" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "geometry" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(screen.getByLabelText("Filter by category")).toHaveProperty("value", "3");
  });

  it("commits debounced search input to the URL", async () => {
    mount();
    const input = await screen.findByRole("searchbox");
    fireEvent.change(input, { target: { value: "algebra" } });
    await waitFor(
      () => expect(push).toHaveBeenCalledWith("/community?q=algebra"),
      { timeout: 1_000 }
    );
  });

  it("commits category and multi-tag AND filters to shareable URLs", async () => {
    const { rerender } = mount();
    await screen.findByRole("option", { name: "Mathematics" });

    fireEvent.change(screen.getByLabelText("Filter by category"), {
      target: { value: "3" },
    });
    expect(push).toHaveBeenCalledWith("/community?categoryId=3");

    state.query = "categoryId=3";
    rerender();
    fireEvent.click(screen.getByRole("button", { name: "algebra" }));
    expect(push).toHaveBeenCalledWith("/community?categoryId=3&tags=algebra");

    state.query = "categoryId=3&tags=algebra";
    rerender();
    fireEvent.click(screen.getByRole("button", { name: "geometry" }));
    expect(push).toHaveBeenCalledWith(
      "/community?categoryId=3&tags=algebra&tags=geometry"
    );

    // Toggling a selected chip OFF removes exactly that tag (AND semantics).
    state.query = "categoryId=3&tags=algebra&tags=geometry";
    rerender();
    fireEvent.click(screen.getByRole("button", { name: "geometry" }));
    expect(push).toHaveBeenLastCalledWith("/community?categoryId=3&tags=algebra");
  });

  it("commits pagination to the URL and reports the position", async () => {
    state.query = "q=algebra&page=1";
    vi.mocked(listPublicPublications).mockResolvedValue({
      items: [card()],
      page: 1,
      size: 12,
      totalElements: 30,
      totalPages: 3,
    });
    mount();

    await screen.findByText(/Page 2 of 3/);
    expect(screen.getByText(/30 quizzes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenCalledWith("/community?q=algebra&page=2");
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(push).toHaveBeenLastCalledWith("/community?q=algebra");
  });

  it("shows the empty state and clears committed filters", async () => {
    state.query = "q=zzz";
    mount();
    await screen.findByText("No quizzes match your filters");
    expect(listPublicPublications).toHaveBeenLastCalledWith({
      q: "zzz",
      categoryId: undefined,
      tags: undefined,
      page: 0,
      size: 12,
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(push).toHaveBeenCalledWith("/community");
  });

  it("shows a busy skeleton while the catalog loads", async () => {
    vi.mocked(listPublicPublications).mockReturnValue(new Promise(() => {}));
    mount();
    const status = await screen.findByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("Loading community quizzes");
  });

  it("shows a role=alert error state", async () => {
    vi.mocked(listPublicPublications).mockRejectedValue({
      kind: "network",
      message: "offline",
      raw: {},
    });
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
  });

  it("derives tag chips from /tags and surfaces rare committed tags", async () => {
    state.query = "tags=rare-tag";
    mount();
    await screen.findByRole("button", { name: "algebra" });
    expect(screen.getByRole("button", { name: "geometry" })).toBeTruthy();
    const rare = screen.getByRole("button", { name: "rare-tag" });
    expect(rare.getAttribute("aria-pressed")).toBe("true");
  });
});
