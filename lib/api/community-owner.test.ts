import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  createCommunityPublication,
  dismissReport,
  getModerationGrant,
  getPublicationHistory,
  hidePublication,
  listModerationReports,
  listMyPublications,
  publishCommunityPublication,
  resolveReport,
  restorePublication,
  unpublishCommunityPublication,
  updateCommunityPublication,
} from "./community-owner";

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const get = vi.mocked(http.get);
const post = vi.mocked(http.post);
const patch = vi.mocked(http.patch);

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  get.mockResolvedValue(undefined as never);
  post.mockResolvedValue(undefined as never);
  patch.mockResolvedValue(undefined as never);
});

describe("community owner + moderation API (ADR-006 §7)", () => {
  it("targets the frozen owner routes", async () => {
    await listMyPublications();
    await publishCommunityPublication(7);
    await unpublishCommunityPublication(7);
    expect(get).toHaveBeenCalledWith("/api/community/me/publications");
    expect(post).toHaveBeenCalledWith("/api/community/publications/7/publish");
    expect(post).toHaveBeenCalledWith("/api/community/publications/7/unpublish");
  });

  it("creates with the §4 create body", async () => {
    await createCommunityPublication({
      examId: 5,
      title: "Algebra fundamentals",
      summary: "Linear equations",
      categoryId: 3,
      tags: ["algebra"],
      authorAlias: "MathWhiz",
      reusePolicy: "NO_FORK",
    });

    expect(post).toHaveBeenCalledWith("/api/community/publications", {
      examId: 5,
      title: "Algebra fundamentals",
      summary: "Linear equations",
      categoryId: 3,
      tags: ["algebra"],
      authorAlias: "MathWhiz",
      reusePolicy: "NO_FORK",
    });
  });

  it("PATCHes the PATCHable set with the expectedVersion token", async () => {
    await updateCommunityPublication(9, {
      title: "Renamed",
      tags: ["geometry"],
      reusePolicy: "ALLOW_FORK",
      expectedVersion: 4,
    });

    expect(patch).toHaveBeenCalledWith("/api/community/publications/9", {
      title: "Renamed",
      tags: ["geometry"],
      reusePolicy: "ALLOW_FORK",
      expectedVersion: 4,
    });
  });

  it("targets the moderation routes", async () => {
    await getModerationGrant();
    await getPublicationHistory(12);

    expect(get).toHaveBeenCalledWith("/api/community/moderation/grant");
    expect(get).toHaveBeenCalledWith(
      "/api/community/moderation/publications/12/history"
    );
  });

  it("lists the report queue with clamped paging params", async () => {
    await listModerationReports({ status: "OPEN", page: 2, size: 500 });
    await listModerationReports({ page: -3, size: 0 });

    expect(get).toHaveBeenNthCalledWith(1, "/api/community/moderation/reports", {
      params: { status: "OPEN", page: 2, size: 50 },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/api/community/moderation/reports", {
      params: { status: undefined, page: 0, size: 1 },
    });
  });

  it("sends the mandatory reason for hide/restore", async () => {
    await hidePublication(3, "spam cleanup");
    await restorePublication(3, "false positive");

    expect(post).toHaveBeenCalledWith(
      "/api/community/moderation/publications/3/hide",
      { reason: "spam cleanup" }
    );
    expect(post).toHaveBeenCalledWith(
      "/api/community/moderation/publications/3/restore",
      { reason: "false positive" }
    );
  });

  it("omits the optional dismiss/resolve note when empty", async () => {
    await dismissReport(9, undefined);
    await resolveReport(11, "handled by hiding");

    expect(post).toHaveBeenCalledWith("/api/community/moderation/reports/9/dismiss", {});
    expect(post).toHaveBeenCalledWith("/api/community/moderation/reports/11/resolve", {
      note: "handled by hiding",
    });
  });
});
