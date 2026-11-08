// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublishToCommunityDialog } from "./PublishToCommunityDialog";
import {
  createCommunityPublication,
  publishCommunityPublication,
  type OwnerPublication,
} from "@/lib/api/community-owner";
import { listPublicCategories } from "@/lib/api/community";

/**
 * P3-A-FE2 (#44) — "Publish to Community" dialog: consent UX (alias
 * acknowledgment, ALLOW_FORK warning), the §4 create→publish two-step, and
 * the per-step error paths (exists-conflict at create, moderation-hidden at
 * publish). Module-mock style follows app/community/community.test.tsx.
 */

vi.mock("@/lib/api/community-owner", () => ({
  createCommunityPublication: vi.fn(),
  publishCommunityPublication: vi.fn(),
}));

vi.mock("@/lib/api/community", () => ({
  listPublicCategories: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { displayName: "Grace Hopper", roles: ["TEACHER"] },
  }),
}));

const onSuccess = vi.fn();
const onCancel = vi.fn();

function publication(overrides: Partial<OwnerPublication> = {}): OwnerPublication {
  return {
    publicationId: 7,
    title: "Algebra fundamentals",
    summary: null,
    authorName: "MathWhiz",
    categoryCode: null,
    categoryTitle: null,
    tags: [],
    questionCount: 12,
    sectionCount: 3,
    durationMinutes: 30,
    publishedAt: null,
    allowFork: false,
    examId: 5,
    status: "UNPUBLISHED",
    moderationState: "VISIBLE",
    reusePolicy: "NO_FORK",
    version: 0,
    openReportCount: 0,
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    authorAlias: "MathWhiz",
    ...overrides,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <PublishToCommunityDialog
          open
          exam={{ id: 5, title: "Algebra fundamentals" }}
          onCancel={onCancel}
          onSuccess={onSuccess}
        />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.mocked(listPublicCategories).mockResolvedValue([
    { id: 3, code: "toan", title: "Mathematics" },
  ]);
  vi.mocked(createCommunityPublication).mockReset();
  vi.mocked(publishCommunityPublication).mockReset();
  onSuccess.mockReset();
  onCancel.mockReset();
});
afterEach(cleanup);

async function acceptAlias() {
  fireEvent.click(screen.getByLabelText(/publicly visible to everyone/i));
}

describe("PublishToCommunityDialog", () => {
  it("prefills title and display-name alias but not the acknowledgment", async () => {
    mount();
    await screen.findByRole("dialog");
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
      "Algebra fundamentals"
    );
    expect(
      (screen.getByLabelText(/public credit alias/i) as HTMLInputElement).value
    ).toBe("Grace Hopper");
    expect(
      (screen.getByLabelText(/publicly visible to everyone/i) as HTMLInputElement)
        .checked
    ).toBe(false);
  });

  it("blocks submit on validation errors and never calls the API", async () => {
    mount();
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/public credit alias/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish to community" }));

    expect(await screen.findByText("Title is required.")).toBeTruthy();
    expect(
      await screen.findByText("A public credit alias is required to publish.")
    ).toBeTruthy();
    expect(
      await screen.findByText(/Acknowledge that this alias will be publicly visible/)
    ).toBeTruthy();
    expect(createCommunityPublication).not.toHaveBeenCalled();
    expect(publishCommunityPublication).not.toHaveBeenCalled();
  });

  it("shows the ALLOW_FORK consent warning only when forking is selected", async () => {
    mount();
    await screen.findByRole("dialog");
    expect(screen.queryByText(/correct answer/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Allow forking/));
    expect(
      screen.getByText(/full copy of every question AND its correct answer/)
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(/Allow forking/) as HTMLInputElement).checked
    ).toBe(true);
  });

  it("caps tags at 5 and rejects invalid labels", async () => {
    mount();
    const input = await screen.findByLabelText(/tags/i);
    for (const tag of ["a1", "b2", "c3", "d4", "e5", "f6"]) {
      fireEvent.change(input, { target: { value: tag } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    expect(await screen.findByText("Add at most 5 tags.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove tag a1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove tag f6" })).toBeNull();

    fireEvent.change(input, { target: { value: "UPPER!" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText(/lowercase letters, digits, spaces or hyphens/)
    ).toBeTruthy();
  });

  it("runs the create→publish sequence and reports success", async () => {
    vi.mocked(createCommunityPublication).mockResolvedValue(publication());
    vi.mocked(publishCommunityPublication).mockResolvedValue(
      publication({ status: "PUBLISHED", publishedAt: "2026-11-08T11:00:00Z" })
    );
    mount();
    await screen.findByRole("dialog");
    await screen.findByRole("option", { name: "Mathematics" });
    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: "Linear equations" },
    });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "3" } });
    const tagInput = screen.getByLabelText(/tags/i);
    fireEvent.change(tagInput, { target: { value: "algebra" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    await acceptAlias();

    fireEvent.click(screen.getByRole("button", { name: "Publish to community" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(7));
    expect(createCommunityPublication).toHaveBeenCalledWith({
      examId: 5,
      title: "Algebra fundamentals",
      summary: "Linear equations",
      categoryId: 3,
      tags: ["algebra"],
      authorAlias: "Grace Hopper",
      reusePolicy: "NO_FORK",
    });
    expect(publishCommunityPublication).toHaveBeenCalledWith(7);
  });

  it("surfaces the exists-conflict with a link to /community/mine and never publishes", async () => {
    vi.mocked(createCommunityPublication).mockRejectedValue({
      kind: "api",
      status: 409,
      code: "COMMUNITY_PUBLICATION_EXISTS",
      message: "duplicate",
      raw: {},
    });
    mount();
    await screen.findByRole("dialog");
    await acceptAlias();
    fireEvent.click(screen.getByRole("button", { name: "Publish to community" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("already has a community publication");
    const link = screen.getByRole("link", { name: "Open My community publications" });
    expect(link.getAttribute("href")).toBe("/community/mine");
    expect(publishCommunityPublication).not.toHaveBeenCalled();
  });

  it("surfaces a publish-step failure and notes the saved-unpublished row", async () => {
    vi.mocked(createCommunityPublication).mockResolvedValue(publication());
    vi.mocked(publishCommunityPublication).mockRejectedValue({
      kind: "api",
      status: 409,
      code: "COMMUNITY_MODERATION_HIDDEN",
      message: "hidden",
      raw: {},
    });
    mount();
    await screen.findByRole("dialog");
    await acceptAlias();
    fireEvent.click(screen.getByRole("button", { name: "Publish to community" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("moderator has hidden this publication");
    expect(alert.textContent).toContain("saved as unpublished");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
