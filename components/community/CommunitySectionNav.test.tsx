// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommunitySectionNav } from "./CommunitySectionNav";

afterEach(cleanup);

describe("CommunitySectionNav", () => {
  it("links to saved quizzes inside Community and highlights only Browse", () => {
    render(<CommunitySectionNav current="browse" />);
    const explore = screen.getByRole("link", { name: "Explore quizzes" });
    const saved = screen.getByRole("link", { name: "Saved quizzes" });
    expect(explore.getAttribute("href")).toBe("/community");
    expect(saved.getAttribute("href")).toBe("/community/bookmarks");
    expect(explore.getAttribute("aria-current")).toBe("page");
    expect(saved.getAttribute("aria-current")).toBeNull();
  });

  it("highlights Saved when viewing the shared saved-quiz collection", () => {
    render(<CommunitySectionNav current="saved" />);
    expect(screen.getByRole("link", { name: "Saved quizzes" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Explore quizzes" }).getAttribute("aria-current")).toBeNull();
  });
});
