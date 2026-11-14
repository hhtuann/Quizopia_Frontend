import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_THRESHOLD_MS,
  TIMELINE_GROUPS,
  TIMELINE_TYPE_LABEL,
  answerAcceptedSummary,
  clockSkewMs,
  describeTimelineItem,
  groupAnswerVersions,
  hasClockSkew,
  timelineGroupOf,
  timelineGroupTypes,
  timelineSourceLabel,
  timelineTypeLabel,
} from "./timeline";
import { CLIENT_ACTIVITY_EVENT_TYPES, type AttemptTimelineItem } from "@/lib/api/monitoring";

function item(overrides: Partial<AttemptTimelineItem>): AttemptTimelineItem {
  return {
    eventId: "e-1",
    eventType: "TAB_HIDDEN",
    source: "CLIENT",
    clientOccurredAt: "2026-07-10T08:00:00Z",
    clientSequence: 3,
    serverReceivedAt: "2026-07-10T08:00:01Z",
    metadata: null,
    ...overrides,
  };
}

describe("labels + groups", () => {
  it("has a friendly label for every CLIENT event type and unknown falls back", () => {
    for (const type of CLIENT_ACTIVITY_EVENT_TYPES) {
      expect(TIMELINE_TYPE_LABEL[type]).toBeTruthy();
    }
    expect(timelineTypeLabel("SOME_FUTURE_TYPE")).toBe("SOME_FUTURE_TYPE");
  });

  it("maps every group to its type list and back", () => {
    expect(timelineGroupTypes("ALL")).toEqual([]);
    const answers = timelineGroupTypes("ANSWERS");
    expect(answers).toContain("ANSWER_ACCEPTED");
    for (const type of answers) {
      expect(timelineGroupOf(type)).toBe("ANSWERS");
    }
    expect(timelineGroupOf("ATTEMPT_SUBMITTED")).toBe("LIFECYCLE");
    expect(timelineGroupOf("QUESTION_NAVIGATED")).toBe("NAVIGATION");
    expect(timelineGroupOf("PAGE_RELOADED")).toBe("ATTENTION");
    expect(timelineGroupOf("CONNECTION_LOST")).toBe("CONNECTION");
  });

  it("group values are unique and ALL is first", () => {
    const values = TIMELINE_GROUPS.map((g) => g.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values[0]).toBe("ALL");
  });
});

describe("source badges", () => {
  it("labels SERVER as server-confirmed, CLIENT as observation", () => {
    expect(timelineSourceLabel("SERVER")).toBe("Server-confirmed");
    expect(timelineSourceLabel("CLIENT")).toBe("Client observation");
  });
});

describe("clock skew", () => {
  it("flags skew beyond the 2-minute threshold (either direction)", () => {
    expect(CLOCK_SKEW_THRESHOLD_MS).toBe(120_000);
    // 1s apart → no skew.
    expect(hasClockSkew(item({}))).toBe(false);
    // Client 3 minutes AHEAD of the server stamp.
    expect(
      hasClockSkew(
        item({ clientOccurredAt: "2026-07-10T08:03:00Z", serverReceivedAt: "2026-07-10T08:00:00Z" })
      )
    ).toBe(true);
    // Client 3 minutes BEHIND.
    expect(
      hasClockSkew(
        item({ clientOccurredAt: "2026-07-10T07:57:00Z", serverReceivedAt: "2026-07-10T08:00:00Z" })
      )
    ).toBe(true);
  });

  it("returns null skew without a client timestamp or on invalid dates", () => {
    expect(clockSkewMs(item({ clientOccurredAt: null }))).toBeNull();
    expect(clockSkewMs(item({ clientOccurredAt: "not-a-date" }))).toBeNull();
  });
});

describe("ANSWER_ACCEPTED summary (metadata only)", () => {
  it("builds the summary from metadata; neutral id label without a label map (FE-7b)", () => {
    const accepted = item({
      eventType: "ANSWER_ACCEPTED",
      source: "SERVER",
      clientOccurredAt: null,
      metadata: { attemptQuestionId: 3, acceptedSequence: 2 },
    });
    // No label map (teacher panel): the raw DB id is neutral, never "Q3".
    expect(answerAcceptedSummary(accepted)).toBe("Answer question #3 → v2 accepted");
    // With a label map (student result page): the position label is used.
    expect(answerAcceptedSummary(accepted, { 3: "Q1" })).toBe("Answer Q1 → v2 accepted");
  });

  it("returns null for other types or malformed metadata", () => {
    expect(answerAcceptedSummary(item({ eventType: "TAB_HIDDEN" }))).toBeNull();
    expect(
      answerAcceptedSummary(item({ eventType: "ANSWER_ACCEPTED", metadata: {} }))
    ).toBeNull();
    expect(
      answerAcceptedSummary(
        item({ eventType: "ANSWER_ACCEPTED", metadata: { attemptQuestionId: "x" } })
      )
    ).toBeNull();
  });
});

describe("describeTimelineItem", () => {
  it("combines label, source, skew and summary in one view model", () => {
    const view = describeTimelineItem(
      item({
        eventType: "ANSWER_ACCEPTED",
        source: "SERVER",
        clientOccurredAt: null,
        metadata: { attemptQuestionId: 9, acceptedSequence: 4 },
      }),
      { 9: "Q2" }
    );
    expect(view).toEqual({
      label: "Answer accepted",
      sourceLabel: "Server-confirmed",
      skewMs: null,
      skewed: false,
      summary: "Answer Q2 → v4 accepted",
    });
  });
});

describe("groupAnswerVersions (FE-7c numeric ordering)", () => {
  const historyItems = [
    { attemptQuestionId: 4821, acceptedSequence: 1, acceptedAt: "2026-07-10T08:00:01Z" },
    { attemptQuestionId: 4810, acceptedSequence: 2, acceptedAt: "2026-07-10T08:02:00Z" },
    { attemptQuestionId: 4821, acceptedSequence: 2, acceptedAt: "2026-07-10T08:01:00Z" },
    { attemptQuestionId: 4802, acceptedSequence: 1, acceptedAt: "2026-07-10T08:00:30Z" },
  ];
  const labels: Record<number, string> = {
    4802: "Q2",
    4810: "Q10",
    4821: "Q3",
  };

  it("orders groups numerically by label index (Q2 before Q10, not locale order)", () => {
    const groups = groupAnswerVersions(historyItems, labels);
    expect(groups.map((g) => g.label)).toEqual(["Q2", "Q3", "Q10"]);
  });

  it("orders versions by sequence inside each group and falls back to neutral labels", () => {
    const groups = groupAnswerVersions(historyItems, labels);
    expect(groups[1].versions.map((v) => v.sequence)).toEqual([1, 2]);

    const unlabeled = groupAnswerVersions(historyItems);
    expect(unlabeled.map((g) => g.label)).toEqual([
      "question #4802",
      "question #4810",
      "question #4821",
    ]);
  });
});
