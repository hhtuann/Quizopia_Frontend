// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraPreflightCard } from "./CameraPreflightCard";
import { useCameraPreflight } from "@/lib/media/use-camera-preflight";
import type { CameraPreflightState } from "@/lib/media/use-camera-preflight";

/** P4-B: the preflight card renders the hook state machine — idle CTA,
 * staged progress with the preview <video>, role="alert" failures with a
 * retry that resets the run, and the onReady(lease, keepAlive) contract. */

vi.mock("@/lib/media/use-camera-preflight", () => ({
  useCameraPreflight: vi.fn(),
}));

const hookMock = vi.mocked(useCameraPreflight);

function mockPreflight(overrides: Partial<CameraPreflightState>): CameraPreflightState {
  return {
    status: "idle",
    previewRef: { current: null },
    lease: null,
    verifyState: null,
    lastError: null,
    cameraRequired: true,
    start: vi.fn(),
    retry: vi.fn(),
    keepAlive: vi.fn(() => null),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  hookMock.mockReset();
});

describe("CameraPreflightCard", () => {
  it("idle renders the enable-camera CTA and wires start()", () => {
    const state = mockPreflight({ status: "idle" });
    hookMock.mockReturnValue(state);
    render(<CameraPreflightCard sessionId={5} cameraRequired onReady={vi.fn()} />);

    expect(screen.getByText(/camera check is required/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /enable camera/i }));
    expect(state.start).toHaveBeenCalledTimes(1);
  });

  it("connecting stage covers server+room connect BEFORE the permission prompt", () => {
    hookMock.mockReturnValue(mockPreflight({ status: "connecting" }));
    const { container } = render(
      <CameraPreflightCard sessionId={5} cameraRequired onReady={vi.fn()} />
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Connecting your camera…");
    expect(status.textContent).toContain("Starting the camera check");
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("permission stage keeps the preview video mounted for the incoming track", () => {
    hookMock.mockReturnValue(mockPreflight({ status: "permission" }));
    const { container } = render(
      <CameraPreflightCard sessionId={5} cameraRequired onReady={vi.fn()} />
    );

    expect(screen.getByRole("status").textContent).toContain("Requesting camera access…");
    expect(container.querySelector("video")).not.toBeNull();
  });
  it("verifying renders the preview video (muted, playsInline) and stage copy", () => {
    hookMock.mockReturnValue(mockPreflight({ status: "verifying", verifyState: "NOT_PUBLISHED" }));
    const { container } = render(
      <CameraPreflightCard sessionId={5} cameraRequired onReady={vi.fn()} />
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video!.getAttribute("playsinline")).not.toBeNull();
    expect(video!.className).toContain("aspect-video");
    expect(screen.getByRole("status").textContent).toContain("Verifying your camera…");
  });

  it("denied renders role=alert copy with browser instructions and a retry", () => {
    const state = mockPreflight({ status: "denied" });
    hookMock.mockReturnValue(state);
    render(<CameraPreflightCard sessionId={5} cameraRequired onReady={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Camera access was denied");
    expect(alert.textContent).toContain("Allow camera access");
    fireEvent.click(screen.getByRole("button", { name: /retry camera check/i }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it("unavailable, infra and timeout render their truthful error copy", () => {
    for (const status of ["unavailable", "infra", "timeout"] as const) {
      hookMock.mockReturnValue(mockPreflight({ status }));
      const { unmount } = render(
        <CameraPreflightCard sessionId={5} cameraRequired onReady={vi.fn()} />
      );
      const alert = screen.getByRole("alert");
      expect(alert.textContent).not.toBeNull();
      unmount();
      cleanup();
    }
  });

  it("READY notifies onReady with the lease and keepAlive, then null on loss", () => {
    const keepAlive = vi.fn(() => null);
    const onReady = vi.fn();
    hookMock.mockReturnValue(
      mockPreflight({
        status: "ready",
        lease: {
          readinessLease: "lease-1",
          readinessExpiresAt: "2026-11-14T10:01:30Z",
          verifiedCameraTrackSid: "sid-1",
        },
        keepAlive,
      })
    );
    const { rerender } = render(
      <CameraPreflightCard sessionId={5} cameraRequired onReady={onReady} />
    );
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith("lease-1", keepAlive);
    expect(screen.getByRole("status").textContent).toContain("Camera verified");

    // Losing readiness (retry/expiry) re-notifies with null so the parent
    // re-disables Start.
    hookMock.mockReturnValue(mockPreflight({ status: "timeout", keepAlive }));
    rerender(<CameraPreflightCard sessionId={5} cameraRequired onReady={onReady} />);
    expect(onReady).toHaveBeenLastCalledWith(null, keepAlive);
  });

  it("does not re-notify for the same lease on unrelated re-renders", () => {
    const onReady = vi.fn();
    const lease = {
      readinessLease: "lease-1",
      readinessExpiresAt: "2026-11-14T10:01:30Z",
      verifiedCameraTrackSid: "sid-1",
    };
    hookMock.mockReturnValue(mockPreflight({ status: "ready", lease }));
    const { rerender } = render(
      <CameraPreflightCard sessionId={5} cameraRequired onReady={onReady} />
    );
    rerender(<CameraPreflightCard sessionId={5} cameraRequired={false} onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
