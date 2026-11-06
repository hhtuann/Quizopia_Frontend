import { describe, expect, it } from "vitest";
import { buildLoginRedirect, sanitizeReturnTo } from "./redirect";

describe("sanitizeReturnTo", () => {
  it("accepts internal paths with query strings", () => {
    expect(sanitizeReturnTo("/sessions/42")).toBe("/sessions/42");
    expect(sanitizeReturnTo("/sessions/42?tab=1")).toBe("/sessions/42?tab=1");
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(sanitizeReturnTo("https://evil.example")).toBeNull();
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
    expect(sanitizeReturnTo("/\\evil.example")).toBeNull();
    expect(sanitizeReturnTo("evil.example")).toBeNull();
  });

  it("rejects empty and nullish values", () => {
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
  });
});

describe("buildLoginRedirect", () => {
  it("encodes the full path and search into returnTo", () => {
    expect(buildLoginRedirect("/sessions/42", "?x=1&y=a b")).toBe(
      `/login?returnTo=${encodeURIComponent("/sessions/42?x=1&y=a b")}`
    );
  });
});
