import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  getPublicPublication,
  listPublicCategories,
  listPublicPublications,
  listPublicTags,
} from "./community";

vi.mock("./http-client", () => ({ http: { get: vi.fn() } }));

const get = vi.mocked(http.get);

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(undefined as never);
});

describe("community public API (ADR-006 §7)", () => {
  it("targets the frozen anonymous routes", async () => {
    await listPublicPublications();
    await getPublicPublication(7);
    await listPublicCategories();
    await listPublicTags();

    const urls = get.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      "/api/public/community/publications",
      "/api/public/community/publications/7",
      "/api/public/community/categories",
      "/api/public/community/tags",
    ]);
  });

  it("normalizes and clamps catalog params (tags comma-joined, size ≤ 50)", async () => {
    await listPublicPublications({
      q: "  algebra  ",
      categoryId: 3,
      tags: ["Algebra", "   ", "Grade-10"],
      page: 2,
      size: 500,
    });

    expect(get).toHaveBeenCalledWith("/api/public/community/publications", {
      params: {
        q: "algebra",
        categoryId: 3,
        tags: "algebra,grade-10",
        page: 2,
        size: 50,
      },
    });
  });

  it("sends only defaults when no filter is set", async () => {
    await listPublicPublications({});

    expect(get).toHaveBeenCalledWith("/api/public/community/publications", {
      params: {
        q: undefined,
        categoryId: undefined,
        tags: undefined,
        page: 0,
        size: 12,
      },
    });
  });

  it("floors the page size at 1 and the page index at 0", async () => {
    await listPublicPublications({ page: -5, size: 0 });

    expect(get).toHaveBeenCalledWith("/api/public/community/publications", {
      params: { q: undefined, categoryId: undefined, tags: undefined, page: 0, size: 1 },
    });
  });
});
