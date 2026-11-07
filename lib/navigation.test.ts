import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemsForRoles, navItemsForView } from "./navigation";

/**
 * P3-B1-FE (#46) — the saved-collection entry must be reachable by BOTH
 * roles in BOTH views (one shared bookmark collection, ADR-006 §7) and must
 * never leak to anonymous users.
 */

const saved = NAV_ITEMS.find((i) => i.href === "/community/bookmarks");

describe("navigation: saved quizzes entry (#46)", () => {
  it("declares the shared STUDENT+TEACHER item", () => {
    expect(saved).toBeDefined();
    expect(saved?.label).toBe("Saved quizzes");
    expect(saved?.roles).toEqual(["STUDENT", "TEACHER"]);
    expect(saved?.view).toBe("shared");
  });

  it("is visible in every authenticated view for both roles", () => {
    for (const roles of [["STUDENT"], ["TEACHER"], ["STUDENT", "TEACHER"]]) {
      for (const view of ["student", "teacher"] as const) {
        const items = navItemsForView(roles, view);
        expect(items.some((i) => i.href === "/community/bookmarks")).toBe(true);
      }
    }
  });

  it("is filtered out for anonymous/empty roles", () => {
    expect(
      navItemsForRoles(null).some((i) => i.href === "/community/bookmarks")
    ).toBe(false);
    expect(
      navItemsForRoles([]).some((i) => i.href === "/community/bookmarks")
    ).toBe(false);
  });
});
