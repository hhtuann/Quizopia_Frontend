import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  classifyBookmarkError,
  deleteBookmark,
  listMyBookmarks,
  putBookmark,
} from "./community-bookmarks";

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const get = vi.mocked(http.get);
const put = vi.mocked(http.put);
const del = vi.mocked(http.delete);

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  del.mockReset();
  get.mockResolvedValue(undefined as never);
  put.mockResolvedValue(undefined as never);
  del.mockResolvedValue(undefined as never);
});

describe("community bookmark API (ADR-006 §7)", () => {
  it("targets the frozen authenticated routes", async () => {
    await putBookmark(7);
    await deleteBookmark(7);
    await listMyBookmarks();

    expect(put).toHaveBeenCalledWith(
      "/api/community/publications/7/bookmark"
    );
    expect(del).toHaveBeenCalledWith(
      "/api/community/publications/7/bookmark"
    );
    expect(get).toHaveBeenCalledWith("/api/community/me/bookmarks", {
      params: { page: 0, size: 12 },
    });
  });

  it("clamps list params (page ≥ 0, size ∈ [1, 50], defaults)", async () => {
    await listMyBookmarks({ page: -5, size: 500 });
    expect(get).toHaveBeenLastCalledWith("/api/community/me/bookmarks", {
      params: { page: 0, size: 50 },
    });

    await listMyBookmarks({ page: 2, size: 0 });
    expect(get).toHaveBeenLastCalledWith("/api/community/me/bookmarks", {
      params: { page: 2, size: 1 },
    });
  });

  it("classifies 404/401/429/network distinctly", () => {
    expect(
      classifyBookmarkError({ kind: "api", status: 404, code: "COMMUNITY_NOT_FOUND", message: "", raw: {} })
    ).toBe("gone");
    expect(
      classifyBookmarkError({ kind: "api", status: 401, code: "AUTH_ACCESS_DENIED", message: "", raw: {} })
    ).toBe("unauthenticated");
    expect(
      classifyBookmarkError({ kind: "api", status: 429, code: "COMMUNITY_RATE_LIMITED", message: "", raw: {} })
    ).toBe("rateLimited");
    expect(
      classifyBookmarkError({ kind: "network", message: "offline", raw: {} })
    ).toBe("network");
    expect(
      classifyBookmarkError({ kind: "api", status: 500, code: "INTERNAL_ERROR", message: "", raw: {} })
    ).toBe("other");
    expect(classifyBookmarkError(undefined)).toBe("other");
  });
});
