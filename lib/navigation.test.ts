import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  isActive,
  navItemsForRoles,
  navItemsForView,
} from "./navigation";

describe("community sidebar navigation", () => {
  const community = NAV_ITEMS.find((item) => item.href === "/community");

  it("uses one shared Community entry rather than a second Saved quizzes item", () => {
    expect(community).toBeDefined();
    expect(community?.label).toBe("Community");
    expect(community?.view).toBe("shared");
    expect(NAV_ITEMS.some((item) => item.href === "/community/bookmarks")).toBe(false);
  });

  it("highlights only Community for its nested routes in either role view", () => {
    for (const roles of [["STUDENT"], ["TEACHER"], ["STUDENT", "TEACHER"]]) {
      for (const view of ["student", "teacher"] as const) {
        const items = navItemsForView(roles, view);
        expect(items.filter((item) => isActive("/community/bookmarks", item)).map((item) => item.href)).toEqual(["/community"]);
        expect(items.filter((item) => isActive("/community/quizzes/7", item)).map((item) => item.href)).toEqual(["/community"]);
        expect(items.filter((item) => isActive("/community/mine", item)).map((item) => item.href)).toEqual(["/community"]);
      }
    }
  });

  it("allows moderator-only accounts to reach the shared Community sidebar item", () => {
    expect(navItemsForView(["COMMUNITY_MODERATOR"], "student").some((item) => item.href === "/community")).toBe(true);
  });

  it("does not show protected navigation to anonymous users", () => {
    expect(navItemsForRoles(null).some((item) => item.href === "/community")).toBe(false);
    expect(navItemsForRoles([]).some((item) => item.href === "/community")).toBe(false);
  });
});
