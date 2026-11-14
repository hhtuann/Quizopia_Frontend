// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraTile } from "./CameraTile";
import type { CameraParticipantState } from "@/lib/api/media";
import { ConnectionQuality } from "livekit-client";

/**
 * P4-B tile: state badges, quality label, attempt chip, placeholder for
 * track-less tiles, fullscreen entry/exit, and the confirm-gated revoke.
 */

function track() {
  // Test double for a livekit RemoteVideoTrack — attach/detach only.
  const fake = { attach: vi.fn(), detach: vi.fn() };
  return fake as unknown as NonNullable<Parameters<typeof CameraTile>[0]["track"]>;
}

function participant(overrides: Partial<Parameters<typeof CameraTile>[0]> = {}) {
  return {
    identity: "media-abc",
    displayName: "Alice Nguyen",
    state: "CONNECTED" as CameraParticipantState,
    attemptId: 42,
    connectedSince: "2026-11-14T09:00:00Z",
    lastVerifiedAt: "2026-11-14T09:05:00Z",
    track: track(),
    connectionQuality: ConnectionQuality.Good,
    muted: false,
    isFullscreen: false,
    onFullscreen: vi.fn(),
    onExitFullscreen: vi.fn(),
    onRevoke: vi.fn(),
    ...overrides,
  };
}

const realRequestFullscreen = HTMLElement.prototype.requestFullscreen;
const realExitFullscreen = document.exitFullscreen;
let requestFullscreenSpy: ReturnType<typeof vi.fn>;
let exitFullscreenSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom has no Fullscreen API — stub both paths (restored after).
  requestFullscreenSpy = vi.fn(() => Promise.resolve(undefined));
  HTMLElement.prototype.requestFullscreen = requestFullscreenSpy;
  exitFullscreenSpy = vi.fn(() => Promise.resolve(undefined));
  document.exitFullscreen = exitFullscreenSpy;
});

afterEach(() => {
  HTMLElement.prototype.requestFullscreen = realRequestFullscreen;
  document.exitFullscreen = realExitFullscreen;
  cleanup();
});

describe("CameraTile", () => {
  it("renders the resolved name, live state badge and quality label", () => {
    render(<CameraTile {...participant()} />);
    expect(screen.getByText("Alice Nguyen")).toBeDefined();
    expect(screen.getByText("Connected")).toBeDefined();
    expect(screen.getByText("Good")).toBeDefined();
    expect(
      document.querySelector('[data-media-identity="media-abc"] video')
    ).not.toBeNull();
  });

  it("attaches and detaches the subscribed track to the video element", () => {
    const withTrack = track();
    const view = render(<CameraTile {...participant({ track: withTrack })} />);
    expect(withTrack.attach).toHaveBeenCalledTimes(1);
    view.rerender(<CameraTile {...participant({ track: null })} />);
    expect(withTrack.detach).toHaveBeenCalledTimes(1);
  });

  it("shows the attempt chip only while an attempt is in progress", () => {
    const { rerender } = render(<CameraTile {...participant({ attemptId: 42 })} />);
    expect(screen.getByText("Attempt in progress")).toBeDefined();
    rerender(<CameraTile {...participant({ attemptId: null })} />);
    expect(screen.queryByText("Attempt in progress")).toBeNull();
  });

  it("renders a placeholder with last-verified time when there is no track", () => {
    render(
      <CameraTile
        {...participant({
          track: null,
          state: "RECONNECTING",
          lastVerifiedAt: "2026-11-14T09:05:00Z",
        })}
      />
    );
    expect(screen.getByText(/Last verified/)).toBeDefined();
    expect(screen.getByText("Reconnecting")).toBeDefined();
    expect(document.querySelector('[data-media-identity="media-abc"] video')).toBeNull();
  });

  it("falls back to the media identity when no display name is known", () => {
    render(<CameraTile {...participant({ displayName: null })} />);
    expect(screen.getByText("media-abc")).toBeDefined();
  });

  it("renders a revoked badge and hides the revoke action", () => {
    render(<CameraTile {...participant({ state: "REVOKED", track: null })} />);
    expect(screen.getByText("Revoked")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("requests fullscreen and selects the tile for the HIGH layer", () => {
    const onFullscreen = vi.fn();
    render(<CameraTile {...participant({ onFullscreen })} />);
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen Alice Nguyen" }));
    expect(onFullscreen).toHaveBeenCalledWith("media-abc");
    expect(requestFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(exitFullscreenSpy).not.toHaveBeenCalled();
  });

  it("exits fullscreen from the in-fullscreen button (toggle)", () => {
    const onFullscreen = vi.fn();
    const onExitFullscreen = vi.fn();
    render(
      <CameraTile
        {...participant({ isFullscreen: true, onFullscreen, onExitFullscreen })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(onExitFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(onFullscreen).not.toHaveBeenCalled();
    expect(requestFullscreenSpy).not.toHaveBeenCalled();
  });

  it("flags a muted publisher with a distinct overlay (frozen frame ≠ live)", () => {
    const { rerender } = render(<CameraTile {...participant({ muted: true })} />);
    expect(screen.getByText("Camera off (muted)")).toBeDefined();
    expect(document.querySelector('[data-camera-muted="true"]')).not.toBeNull();
    rerender(<CameraTile {...participant({ muted: false })} />);
    expect(screen.queryByText("Camera off (muted)")).toBeNull();
  });

  it("keeps the placeholder (not the muted overlay) for track-less tiles", () => {
    render(
      <CameraTile
        {...participant({ muted: true, track: null, lastVerifiedAt: null, connectedSince: null })}
      />
    );
    expect(screen.queryByText("Camera off (muted)")).toBeNull();
    expect(screen.getByText(/Waiting for camera/)).toBeDefined();
  });

  it("deselects on fullscreenchange exit (Esc / browser chrome)", () => {
    const onExitFullscreen = vi.fn();
    render(<CameraTile {...participant({ onExitFullscreen })} />);
    fireEvent(document, new Event("fullscreenchange"));
    expect(onExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("revokes only after the confirmation dialog", () => {
    const onRevoke = vi.fn();
    render(<CameraTile {...participant({ onRevoke })} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("revoke-camera-media-abc");

    fireEvent.click(screen.getByRole("button", { name: "Revoke camera" }));
    expect(onRevoke).toHaveBeenCalledWith("media-abc");
  });

  it("keeps the revoke a no-op when cancelled", () => {
    const onRevoke = vi.fn();
    render(<CameraTile {...participant({ onRevoke })} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep camera" }));
    expect(onRevoke).not.toHaveBeenCalled();
  });
});
