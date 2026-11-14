// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraParticipantStatus } from "@/lib/api/media";

/**
 * P4-B card: empty state, N tiles with resolved names, revoke flow
 * (confirm → revokeCameraParticipant → camera-status invalidation) and the
 * fullscreen delegation into the grid hook.
 */

const { selectForFullscreen, invalidateQueries, revokeCameraParticipant, gridState } =
  vi.hoisted(() => {
    const tiles: Map<string, { track: { attach: () => void; detach: () => void } }> = new Map();
    tiles.set("media-1", { track: { attach: vi.fn(), detach: vi.fn() } });
    return {
      selectForFullscreen: vi.fn(),
      invalidateQueries: vi.fn(),
      revokeCameraParticipant: vi.fn(),
      gridState: {
        tiles,
        fullscreenIdentity: null as string | null,
      },
    };
  });

vi.mock("@/lib/media/use-camera-grid", () => ({
  useCameraGrid: () => ({
    status: "live",
    tiles: gridState.tiles,
    fullscreenIdentity: gridState.fullscreenIdentity,
    selectForFullscreen,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useMutation: ({
    mutationFn,
    onSuccess,
    onError,
  }: {
    mutationFn: (identity: string) => Promise<void>;
    onSuccess?: () => void;
    onError?: () => void;
  }) => ({
    isPending: false,
    mutate: (identity: string) => {
      void mutationFn(identity)
        .then(() => onSuccess?.())
        .catch(() => onError?.());
    },
  }),
}));

vi.mock("@/lib/api/media", () => ({
  revokeCameraParticipant: (...args: unknown[]) => revokeCameraParticipant(...args),
}));

import { CameraGridCard } from "./CameraGridCard";

function status(overrides: Partial<CameraParticipantStatus>): CameraParticipantStatus {
  return {
    mediaIdentity: "media-1",
    userId: 11,
    displayName: "Alice Nguyen",
    attemptId: 42,
    state: "CONNECTED",
    connectedSince: "2026-11-14T09:00:00Z",
    lastVerifiedAt: "2026-11-14T09:05:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  selectForFullscreen.mockReset();
  invalidateQueries.mockReset();
  revokeCameraParticipant.mockReset().mockResolvedValue(undefined);
  gridState.fullscreenIdentity = null;
});

afterEach(cleanup);

describe("CameraGridCard", () => {
  it("renders the privacy chip and an empty state without tiles", () => {
    render(<CameraGridCard sessionId={5} participants={[]} />);
    expect(screen.getByText("Camera monitoring")).toBeDefined();
    expect(screen.getByText("Consented demo · no audio")).toBeDefined();
    expect(screen.getByText(/No camera participants yet/)).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Live");
    expect(document.querySelector("[data-media-identity]")).toBeNull();
  });

  it("renders one tile per camera-status participant with resolved names", () => {
    render(
      <CameraGridCard
        sessionId={5}
        participants={[
          status({ mediaIdentity: "media-1", displayName: "Alice Nguyen" }),
          status({
            mediaIdentity: "media-2",
            userId: 12,
            displayName: "Bob Tran",
            state: "RECONNECTING",
            attemptId: null,
          }),
        ]}
      />
    );
    expect(document.querySelectorAll("[data-media-identity]")).toHaveLength(2);
    expect(screen.getByText("Alice Nguyen")).toBeDefined();
    expect(screen.getByText("Bob Tran")).toBeDefined();
    expect(screen.getByText("Reconnecting")).toBeDefined();
  });

  it("marks the fullscreen tile from the hook state", () => {
    gridState.fullscreenIdentity = "media-1";
    render(<CameraGridCard sessionId={5} participants={[status({})]} />);
    const tile = document.querySelector('[data-media-identity="media-1"]');
    expect(tile?.className).toContain("ring");
  });

  it("delegates fullscreen to the grid hook (single HIGH layer)", () => {
    render(<CameraGridCard sessionId={5} participants={[status({})]} />);
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen Alice Nguyen" }));
    expect(selectForFullscreen).toHaveBeenCalledWith("media-1");
  });

  it("revokes after confirm, then invalidates camera-status", async () => {
    render(<CameraGridCard sessionId={5} participants={[status({})]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke camera" }));

    // mutation + onSuccess invalidation are async — flush microtasks.
    await Promise.resolve();
    expect(revokeCameraParticipant).toHaveBeenCalledWith(5, "media-1");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["exam-sessions", 5, "camera-status"],
    });
  });

  it("keeps the grid when the revoke is cancelled", () => {
    render(<CameraGridCard sessionId={5} participants={[status({})]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep camera" }));
    expect(revokeCameraParticipant).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
