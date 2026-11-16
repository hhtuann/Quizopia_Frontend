// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingStatusPill } from "./RecordingStatusPill";
import type { AttemptMediaStatus } from "@/lib/api/evidence";

/** P4-D: the attempt-header recording pill — three visible states and the
 * hidden (feature off / unmonitored) state. Informational only
 * (role="status"), REST-backed with a 60s staleTime. */

vi.mock("@/lib/api/evidence", () => ({
  fetchAttemptMediaStatus: vi.fn(),
}));

import { fetchAttemptMediaStatus } from "@/lib/api/evidence";

const statusMock = vi.mocked(fetchAttemptMediaStatus);

function media(
  overrides: Partial<AttemptMediaStatus> = {}
): AttemptMediaStatus {
  return {
    fullRecordingEnabled: false,
    rollingBufferActive: false,
    snapshotsEnabled: true,
    ...overrides,
  };
}

function renderPill(active = true): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RecordingStatusPill attemptId={9} active={active} />
    </QueryClientProvider>
  );
}

/** Render + wait until the REST status resolved into the DOM. */
async function settledPill(): Promise<HTMLElement | null> {
  renderPill();
  await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(1));
  // Null states are legitimate — wait for the resolved query to flush.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return document.querySelector<HTMLElement>('[data-testid="recording-status-pill"]');
}

beforeEach(() => {
  statusMock.mockReset();
});

afterEach(cleanup);

describe("RecordingStatusPill", () => {
  it("full recording ON → green 'Buổi thi được ghi hình'", async () => {
    statusMock.mockResolvedValue(media({ fullRecordingEnabled: true }));
    renderPill();
    const pill = await screen.findByTestId("recording-status-pill");
    expect(pill.textContent).toContain("Buổi thi được ghi hình");
    expect(pill.className).toContain("text-[#10B981]");
    expect(pill.getAttribute("role")).toBe("status");
    expect(pill.getAttribute("aria-live")).toBe("polite");
  });

  it("rolling buffer only → blue 'Buổi thi lưu đệm phục vụ clip'", async () => {
    statusMock.mockResolvedValue(
      media({ fullRecordingEnabled: false, rollingBufferActive: true })
    );
    renderPill();
    const pill = await screen.findByTestId("recording-status-pill");
    expect(pill.textContent).toContain("Buổi thi lưu đệm phục vụ clip");
    expect(pill.className).toContain("text-[#0052FF]");
  });

  it("neither recording nor buffer → feature off, renders nothing", async () => {
    statusMock.mockResolvedValue(media());
    expect(await settledPill()).toBeNull();
  });

  it("unmonitored attempt (active=false) never queries and stays null", () => {
    renderPill(false);
    expect(
      document.querySelector('[data-testid="recording-status-pill"]')
    ).toBeNull();
    expect(statusMock).not.toHaveBeenCalled();
  });
});
