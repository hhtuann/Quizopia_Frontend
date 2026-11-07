// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MinePage from "./page";
import {
  listMyPublications,
  publishCommunityPublication,
  unpublishCommunityPublication,
  updateCommunityPublication,
  type OwnerPublication,
} from "@/lib/api/community-owner";
import { listPublicCategories } from "@/lib/api/community";

/**
 * P3-A-FE2 (#44) — /community/mine owner list: badges per
 * status/moderation/reuse state, publish/unpublish actions (idempotent-aware
 * success copy), version-conflict surfacing from the edit dialog, and the
 * standard loading/empty/error states. The (teacher) group layout guard is
 * bypassed by rendering the page component directly (mock-first, #43 style).
 */

vi.mock("@/lib/api/community-owner", () => ({
  listMyPublications: vi.fn(),
  publishCommunityPublication: vi.fn(),
  unpublishCommunityPublication: vi.fn(),
  updateCommunityPublication: vi.fn(),
}));

vi.mock("@/lib/api/community", () => ({
  listPublicCategories: vi.fn(),
}));

function pub(overrides: Partial<OwnerPublication> = {}): OwnerPublication {
  return {
    publicationId: 12,
    title: "Algebra fundamentals",
    summary: "Linear equations",
    authorName: "MathWhiz",
    categoryCode: "toan",
    categoryTitle: "Mathematics",
    tags: ["algebra"],
    questionCount: 12,
    sectionCount: 3,
    durationMinutes: 30,
    publishedAt: "2026-11-01T09:00:00Z",
    allowFork: false,
    examId: 5,
    status: "PUBLISHED",
    moderationState: "VISIBLE",
    reusePolicy: "NO_FORK",
    version: 2,
    openReportCount: 0,
    createdAt: "2026-10-31T08:00:00Z",
    updatedAt: "2026-11-01T09:00:00Z",
    authorAlias: "MathWhiz",
    ...overrides,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MinePage />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.mocked(listPublicCategories).mockResolvedValue([
    { id: 3, code: "toan", title: "Mathematics" },
  ]);
  vi.mocked(listMyPublications).mockReset();
  vi.mocked(listMyPublications).mockResolvedValue([]);
  vi.mocked(publishCommunityPublication).mockReset();
  vi.mocked(unpublishCommunityPublication).mockReset();
  vi.mocked(updateCommunityPublication).mockReset();
});
afterEach(cleanup);

describe("/community/mine", () => {
  it("renders owner cards with status, moderation and reuse badges", async () => {
    vi.mocked(listMyPublications).mockResolvedValue([
      pub(), // PUBLISHED + VISIBLE
      pub({
        publicationId: 13,
        title: "Hidden geometry",
        status: "UNPUBLISHED",
        moderationState: "HIDDEN",
        reusePolicy: "NO_FORK",
        openReportCount: 2,
      }),
      pub({
        publicationId: 14,
        title: "Forkable physics",
        reusePolicy: "ALLOW_FORK",
      }),
    ]);
    mount();
    expect(await screen.findByText("Algebra fundamentals")).toBeTruthy();

    expect(screen.getAllByText("Published").length).toBe(2);
    expect(screen.getAllByText("Visible").length).toBe(2);
    expect(screen.getByText("Hidden by moderation")).toBeTruthy();
    expect(screen.getByText("Forking allowed")).toBeTruthy();
    expect(screen.getByText("2 open reports")).toBeTruthy();
    expect(screen.getAllByText("MathWhiz").length).toBeGreaterThanOrEqual(1);

    // Hidden + unpublished: no Publish, no public link — only the block copy.
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(
      screen.getByText("Hidden geometry").closest("a")
    ).toBeNull();
    expect(
      screen.getByText(/publishing stays blocked until a moderator restores it/)
    ).toBeTruthy();

    // Visible published card links to its public page.
    expect(
      screen.getByRole("link", { name: "Algebra fundamentals" }).getAttribute("href")
    ).toBe("/community/quizzes/12");
    const viewLinks = screen.getAllByRole("link", { name: "View public page" });
    expect(viewLinks).toHaveLength(2);
    expect(viewLinks[0].getAttribute("href")).toBe("/community/quizzes/12");
  });

  it("publishes an UNPUBLISHED row, shows success and refetches the list", async () => {
    vi.mocked(listMyPublications).mockResolvedValue([
      pub({ status: "UNPUBLISHED", moderationState: "VISIBLE", publishedAt: null }),
    ]);
    vi.mocked(publishCommunityPublication).mockResolvedValue(pub());
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(
      screen.getByText(/is live on the community catalog/)
    ).toBeTruthy();
    expect(publishCommunityPublication).toHaveBeenCalledWith(12);
    // The mutation invalidates ["community"] → the owner list refetches.
    await waitFor(
      () => expect(vi.mocked(listMyPublications).mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 1_000 }
    );
  });

  it("unpublishes a PUBLISHED row (idempotent no-op still succeeds)", async () => {
    vi.mocked(listMyPublications).mockResolvedValue([pub()]);
    vi.mocked(unpublishCommunityPublication).mockResolvedValue(
      pub({ status: "UNPUBLISHED", publishedAt: null })
    );
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Unpublish" }));

    expect(await screen.findByText(/was removed from the community catalog/)).toBeTruthy();
    expect(unpublishCommunityPublication).toHaveBeenCalledWith(12);
  });

  it("surfaces a publish blocked-by-moderation error with actionable copy", async () => {
    vi.mocked(listMyPublications).mockResolvedValue([
      pub({ status: "UNPUBLISHED", moderationState: "VISIBLE", publishedAt: null }),
    ]);
    vi.mocked(publishCommunityPublication).mockRejectedValue({
      kind: "api",
      status: 409,
      code: "COMMUNITY_MODERATION_HIDDEN",
      message: "hidden",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Publishing stays blocked until a moderator restores it"
    );
  });

  it("PATCHes with expectedVersion and surfaces the conflict copy on 409", async () => {
    vi.mocked(listMyPublications).mockResolvedValue([pub({ version: 6 })]);
    vi.mocked(updateCommunityPublication).mockRejectedValue({
      kind: "api",
      status: 409,
      code: "COMMUNITY_CONCURRENT_MODIFICATION",
      message: "conflict",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    const titleInput = await screen.findByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: "Renamed quiz" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(await screen.findByText(/changed elsewhere/)).toBeTruthy();
    await waitFor(() =>
      expect(updateCommunityPublication).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ expectedVersion: 6 })
      )
    );
    // The dialog closes on conflict — the page notice carries the copy.
    await waitFor(() =>
      expect(screen.queryByLabelText(/title/i)).toBeNull()
    );
    // Conflict invalidates the list → fresh version lands.
    await waitFor(
      () => expect(vi.mocked(listMyPublications).mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 1_000 }
    );
  });

  it("renders the empty state with a path to /exams", async () => {
    vi.mocked(listMyPublications).mockResolvedValue([]);
    mount();

    expect(await screen.findByText("Nothing published yet")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Go to my exams" }).getAttribute("href")
    ).toBe("/exams");
  });

  it("renders a role=alert error state", async () => {
    vi.mocked(listMyPublications).mockRejectedValue({
      kind: "network",
      message: "offline",
      raw: {},
    });
    mount();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
  });
});
