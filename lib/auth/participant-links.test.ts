import { describe, expect, it } from "vitest";
import { participantBackHref, participantHistoryHref } from "./participant-links";

describe("participant link targets", () => {
  it("STUDENT holders keep the student listings", () => {
    expect(participantBackHref(["STUDENT"])).toBe("/sessions");
    expect(participantHistoryHref(["STUDENT"])).toBe("/attempts");
    expect(participantBackHref(["STUDENT", "TEACHER"])).toBe("/sessions");
  });

  it("TEACHER-only participants are pointed home (student listings are STUDENT-gated)", () => {
    expect(participantBackHref(["TEACHER"])).toBe("/");
    expect(participantHistoryHref(["TEACHER"])).toBe("/");
  });

  it("missing roles fall back to home", () => {
    expect(participantBackHref(null)).toBe("/");
    expect(participantHistoryHref(undefined)).toBe("/");
  });
});
