// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionLandingCard, describeStartError } from "./SessionLandingCard";
import type { SessionEligibility } from "@/lib/api/student-attempts";

function eligibility(overrides: Partial<SessionEligibility>): SessionEligibility {
  return {
    sessionId: 5,
    state: "CAN_START",
    sessionStatus: "OPEN",
    title: "Midterm",
    examTitle: "Mathematics",
    visibility: "PUBLIC",
    startsAt: "2026-07-10T07:00:00Z",
    endsAt: "2026-07-10T10:00:00Z",
    durationMinutes: 60,
    maxAttempts: 2,
    attemptsUsed: 0,
    remainingAttempts: 2,
    activeAttemptId: null,
    activeAttemptDeadlineAt: null,
    canStartNow: true,
    canResume: false,
    serverTime: "2026-07-10T08:00:00Z",
    ...overrides,
  };
}

describe("SessionLandingCard", () => {
  afterEach(cleanup);

  it("CAN_START shows the start action and attempts remaining", () => {
    const onStart = vi.fn();
    render(<SessionLandingCard eligibility={eligibility({})} onStart={onStart} starting={false} />);

    expect(screen.getByText("Midterm")).not.toBeNull();
    expect(screen.getByText("Available to start")).not.toBeNull();
    expect(screen.getByText(/2 of 2 remaining/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start the attempt" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("CAN_RESUME shows the resume action", () => {
    render(
      <SessionLandingCard
        eligibility={eligibility({
          state: "CAN_RESUME",
          canResume: true,
          activeAttemptId: 77,
          canStartNow: false,
        })}
        onStart={vi.fn()}
        starting={false}
      />
    );

    expect(screen.getByText("Resume your attempt")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resume your attempt" })).not.toBeNull();
  });

  it("NOT_YET_STARTED explains the opening time without an action", () => {
    render(
      <SessionLandingCard
        eligibility={eligibility({ state: "NOT_YET_STARTED", canStartNow: false })}
        onStart={vi.fn()}
        starting={false}
      />
    );

    expect(screen.getByText(/This session opens on/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /attempt/i })).toBeNull();
  });

  it("ENDED points to attempt history without an action", () => {
    render(
      <SessionLandingCard
        eligibility={eligibility({ state: "ENDED", canStartNow: false })}
        onStart={vi.fn()}
        starting={false}
      />
    );

    expect(screen.getByText(/closed or its time window has passed/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /attempt/i })).toBeNull();
  });

  it("NO_ATTEMPTS_LEFT and ATTEMPT_EXPIRED render their warnings", () => {
    const { unmount } = render(
      <SessionLandingCard
        eligibility={eligibility({ state: "NO_ATTEMPTS_LEFT", canStartNow: false })}
        onStart={vi.fn()}
        starting={false}
      />
    );
    expect(screen.getByText(/used all 2 attempts/i)).not.toBeNull();
    unmount();

    render(
      <SessionLandingCard
        eligibility={eligibility({ state: "ATTEMPT_EXPIRED", canResume: false })}
        onStart={vi.fn()}
        starting={false}
      />
    );
    expect(screen.getByText(/time ran out/i)).not.toBeNull();
  });

  it("unlimited attempts render as Unlimited", () => {
    render(
      <SessionLandingCard
        eligibility={eligibility({ maxAttempts: 0, remainingAttempts: Number.MAX_SAFE_INTEGER })}
        onStart={vi.fn()}
        starting={false}
      />
    );
    expect(screen.getByText("Unlimited")).not.toBeNull();
  });

  it("never renders answer/grading metadata for any state", () => {
    const { unmount } = render(<SessionLandingCard eligibility={eligibility({})} onStart={vi.fn()} starting={false} />);
    const text = document.body.textContent ?? "";
    for (const forbidden of ["answerKey", "isCorrect", "explanation", "roster"]) {
      expect(text.includes(forbidden)).toBe(false);
    }
    unmount();
  });
});

describe("describeStartError", () => {
  it("maps eligibility/ lifecycle codes to friendly copy", () => {
    expect(describeStartError({ kind: "api", code: "ATTEMPT_NOT_ELIGIBLE", status: 403, message: "x" })).toContain(
      "don't have access"
    );
    expect(describeStartError({ kind: "api", code: "ATTEMPT_OUTSIDE_WINDOW", status: 409, message: "x" })).toContain(
      "window"
    );
    expect(describeStartError({ kind: "network" })).toContain("Network error");
  });
});
