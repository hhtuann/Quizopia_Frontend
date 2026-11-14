// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CameraStatusPill } from "./CameraStatusPill";
import type { AttemptCameraStatus } from "@/lib/media/use-attempt-camera";

/** P4-B: the attempt-header camera pill — labels per state, hidden when the
 * attempt is unmonitored (inactive), always role="status" (informational,
 * never an alert — camera state never blocks answering). */

afterEach(cleanup);

function renderPill(status: AttemptCameraStatus): HTMLElement | null {
  const { container } = render(<CameraStatusPill status={status} />);
  return container.querySelector('[role="status"]');
}

describe("CameraStatusPill", () => {
  it("VERIFIED shows a green 'Camera live' pill", () => {
    const pill = renderPill("verified");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain("Camera live");
    expect(pill!.className).toContain("text-[#10B981]");
  });

  it("RECONNECTING shows an amber reconnecting pill", () => {
    const pill = renderPill("reconnecting");
    expect(pill!.textContent).toContain("Camera reconnecting…");
    expect(pill!.className).toContain("text-[#F59E0B]");
  });

  it("REVOKED shows a red revoked pill", () => {
    const pill = renderPill("revoked");
    expect(pill!.textContent).toContain("Camera revoked");
    expect(pill!.className).toContain("text-[#EF4444]");
  });

  it("UNBOUND stays informational — answers still saved", () => {
    const pill = renderPill("unbound");
    expect(pill!.textContent).toContain("Camera not connected — answers still saved");
  });

  it("CONNECTING shows the connecting label", () => {
    const pill = renderPill("connecting");
    expect(pill!.textContent).toContain("Camera connecting…");
  });

  it("renders nothing for INACTIVE (unmonitored attempt)", () => {
    expect(renderPill("inactive")).toBeNull();
  });

  it("is queryable by role for header layout tests", () => {
    render(<CameraStatusPill status="verified" />);
    expect(screen.getByRole("status")).not.toBeNull();
  });
});
