import { describe, expect, it } from "vitest";
import {
  communityTagsSchema,
  moderationReasonFormSchema,
  publishToCommunitySchema,
} from "./community-schemas";

/** Valid baseline the per-field cases mutate. */
function base() {
  return {
    title: "Algebra fundamentals",
    summary: "",
    categoryId: "",
    tags: ["algebra", "grade-10"],
    authorAlias: "MathWhiz",
    aliasAcknowledged: true,
    reusePolicy: "NO_FORK" as const,
  };
}

describe("community publication schemas (ADR-006 §3/§4 limits)", () => {
  it("accepts the baseline payload", () => {
    const result = publishToCommunitySchema.safeParse(base());
    expect(result.success).toBe(true);
  });

  it("enforces the 1–255 title bound", () => {
    expect(
      publishToCommunitySchema.safeParse({ ...base(), title: "" }).success
    ).toBe(false);
    expect(
      publishToCommunitySchema.safeParse({ ...base(), title: "x".repeat(255) })
        .success
    ).toBe(true);
    expect(
      publishToCommunitySchema.safeParse({ ...base(), title: "x".repeat(256) })
        .success
    ).toBe(false);
  });

  it("caps the summary at 500 characters", () => {
    expect(
      publishToCommunitySchema.safeParse({ ...base(), summary: "x".repeat(500) })
        .success
    ).toBe(true);
    expect(
      publishToCommunitySchema.safeParse({ ...base(), summary: "x".repeat(501) })
        .success
    ).toBe(false);
  });

  it("allows at most 5 tags matching the §3 label grammar", () => {
    expect(communityTagsSchema.safeParse(["a", "b", "c", "d", "e"]).success).toBe(
      true
    );
    expect(
      communityTagsSchema.safeParse(["a", "b", "c", "d", "e", "f"]).success
    ).toBe(false);
    expect(communityTagsSchema.safeParse(["UPPER"]).success).toBe(false);
    expect(communityTagsSchema.safeParse(["-leading-hyphen"]).success).toBe(false);
    expect(communityTagsSchema.safeParse(["ok tag-with space"]).success).toBe(
      true
    );
    expect(
      publishToCommunitySchema.safeParse({
        ...base(),
        tags: ["a", "b", "c", "d", "e", "f"],
      }).success
    ).toBe(false);
  });

  it("requires a 1–80 public credit alias at publish", () => {
    expect(
      publishToCommunitySchema.safeParse({ ...base(), authorAlias: "" }).success
    ).toBe(false);
    expect(
      publishToCommunitySchema.safeParse({ ...base(), authorAlias: "x".repeat(80) })
        .success
    ).toBe(true);
    expect(
      publishToCommunitySchema.safeParse({ ...base(), authorAlias: "x".repeat(81) })
        .success
    ).toBe(false);
  });

  it("requires the public-visibility acknowledgment", () => {
    const result = publishToCommunitySchema.safeParse({
      ...base(),
      aliasAcknowledged: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("aliasAcknowledged");
      expect(result.error.issues[0].message).toMatch(/publicly visible/i);
    }
  });

  it("accepts only the two reuse policies", () => {
    expect(
      publishToCommunitySchema.safeParse({ ...base(), reusePolicy: "ALLOW_FORK" })
        .success
    ).toBe(true);
    expect(
      publishToCommunitySchema.safeParse({
        ...base(),
        reusePolicy: "WHATEVER" as never,
      }).success
    ).toBe(false);
  });

  it("makes the moderation reason mandatory (≤500)", () => {
    expect(moderationReasonFormSchema.safeParse({ reason: "   " }).success).toBe(
      false
    );
    expect(moderationReasonFormSchema.safeParse({ reason: "x".repeat(500) }).success).toBe(true);
    expect(moderationReasonFormSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
  });
});
