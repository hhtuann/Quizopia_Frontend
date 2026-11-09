import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("fluid shell + bounded card collection design contract", () => {
  it("uses auto-fill tracks and a capped child width, not auto-fit expansion", () => {
    const css = source("app/globals.css");
    expect(css).toMatch(/\.adaptive-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,/);
    expect(css).toMatch(/\.adaptive-grid\s*>\s*\*\s*\{[\s\S]*?max-width:\s*var\(--collection-card-max\)/);
    expect(css).toMatch(/--collection-card-min:\s*18rem/);
    expect(css).toMatch(/--collection-card-max:\s*24rem/);
    expect(css).toMatch(/\.adaptive-grid--wide\s*\{[\s\S]*?--collection-card-max:\s*36rem/);
    expect(css).not.toMatch(/repeat\(auto-fit,\s*minmax/);
  });

  it.each([
    ["Dashboard actions", "app/page.tsx", "adaptive-grid"],
    ["Community catalog", "app/community/page.tsx", "adaptive-grid"],
    ["Saved quizzes", "app/(community)/community/bookmarks/page.tsx", "adaptive-grid"],
    ["Available sessions", "app/(student)/sessions/page.tsx", 'className="adaptive-grid"'],
    ["My classes", "app/(student)/my-classes/page.tsx", 'className="adaptive-grid"'],
    ["Class sessions", "app/(student)/my-classes/[id]/page.tsx", 'className="mt-3 adaptive-grid"'],
    ["My results", "components/student/MyResultsSection.tsx", 'className="mt-3 adaptive-grid"'],
    ["Community publications", "app/(teacher)/community/mine/page.tsx", "adaptive-grid adaptive-grid--wide"],
    ["Moderation queue", "app/(community)/community/moderation/page.tsx", "adaptive-grid adaptive-grid--wide"],
  ])("%s uses the bounded collection layout", (_label, path, fragment) => {
    expect(source(path)).toContain(fragment);
  });

  it("does not constrain the Community app shell itself", () => {
    const shell = source("components/community/CommunityAdaptiveShell.tsx");
    expect(shell).toContain('className="page-fluid"');
    expect(shell).not.toContain("max-w-6xl");
  });
});
