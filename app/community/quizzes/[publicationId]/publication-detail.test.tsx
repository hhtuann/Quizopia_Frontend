// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicationDetailPage from "./page";
import {
  getPublicPublication,
  type PublicPublicationDetail,
} from "@/lib/api/community";
import { sanitizeReturnTo } from "@/lib/auth/redirect";

/**
 * P3-A-FE1 (#43) — public quiz detail. Anonymous (no AuthProvider in the
 * tree), safe-DOM assertions for the §7 allowlist, 404 anti-enumeration state
 * and the guest "Sign in to save" CTA carrying `returnTo` (issue #46 replaces
 * the CTA with the real bookmark mutation).
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
});
afterEach(cleanup);

describe("community publication detail page", () => {
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
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/30 min/)).toBeTruthy();
    expect(screen.getByText(/Published/)).toBeTruthy();
    expect(screen.getByText(/Updated/)).toBeTruthy();
    expect(getPublicPublication).toHaveBeenCalledWith(7);
  });

  it("keeps the login CTA's returnTo pointing back at this page", async () => {
    vi.mocked(getPublicPublication).mockResolvedValue(detail());
    mount();

    const cta = await screen.findByRole("link", { name: "Sign in to save" });
    const href = cta.getAttribute("href") ?? "";
    expect(href.startsWith("/login?returnTo=")).toBe(true);
    const returnTo = sanitizeReturnTo(
      new URLSearchParams(href.slice("/login".length)).get("returnTo")
    );
    expect(returnTo).toBe("/community/quizzes/7");
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
