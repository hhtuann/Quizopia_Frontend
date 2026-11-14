// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraPreflight } from "./use-camera-preflight";
import { setActivePublisherRoom } from "./active-room";
import type { PreflightResponse, PreflightVerifyResponse } from "@/lib/api/media";

/**
 * P4-B preflight state machine: getUserMedia → preview attach → connect +
 * publish (SAME track) → verify polling → READY{lease}; denial/infra/timeout
 * classification; teardown on unmount and the room hand-off guard.
 */

vi.mock("@/lib/api/media", () => ({
  createCameraPreflight: vi.fn(),
  verifyCameraPreflight: vi.fn(),
}));

vi.mock("livekit-client", () => {
  const rooms: FakeRoomShape[] = [];
  class FakeRoom {
    state = "connected";
    handlers: Record<string, Array<() => void>> = {};
    localParticipant = {
      publishTrack: vi.fn(async () => ({ kind: "video" })),
    };
    connect = vi.fn(async () => {
      this.state = "connected";
      rooms.push(this);
    });
    disconnect = vi.fn(async () => {
      this.state = "disconnected";
      this.emit("disconnected");
    });
    on(evt: string, cb: () => void) {
      (this.handlers[evt] ??= []).push(cb);
      return this;
    }
    removeAllListeners(evt: string) {
      delete this.handlers[evt];
    }
    emit(evt: string) {
      for (const cb of [...(this.handlers[evt] ?? [])]) cb();
    }
  }
  const FakeMediaStream = class {
    tracks: MediaStreamTrack[];
    constructor(tracks: MediaStreamTrack[]) {
      this.tracks = tracks;
    }
  };
  return {
    Room: FakeRoom,
    RoomEvent: { Disconnected: "disconnected", Connected: "connected" },
    Track: { Source: { Camera: "camera" } },
    VideoPresets: { h360: { encoding: { maxBitrate: 500_000 } } },
    __MediaStream: FakeMediaStream,
    __rooms: rooms,
  };
});

interface FakeRoomShape {
  state: string;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  localParticipant: { publishTrack: ReturnType<typeof vi.fn> };
  emit: (evt: string) => void;
}
interface StubMediaStream {
  tracks: MediaStreamTrack[];
}


import { createCameraPreflight, verifyCameraPreflight } from "@/lib/api/media";
import * as livekitModule from "livekit-client";

const createMock = vi.mocked(createCameraPreflight);
const verifyMock = vi.mocked(verifyCameraPreflight);
const livekitInternals = livekitModule as unknown as {
  __rooms: FakeRoomShape[];
  __MediaStream: new (tracks: MediaStreamTrack[]) => StubMediaStream;
};

function fakeTrack(): MediaStreamTrack {
  return { stop: vi.fn(), readyState: "live" } as unknown as MediaStreamTrack;
}

function streamOf(track: MediaStreamTrack): MediaStream {
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}
function preflightResponse(token = "pf-token"): PreflightResponse {
  return {
    preflightId: "pf-1",
    mediaToken: token,
    mediaTokenExpiresAt: "2026-11-14T10:02:00Z",
    mediaIdentity: "media-id",
    wsUrl: "ws://media.test",
    roomScope: "session",
    cameraRequired: true,
    expiresAt: "2026-11-14T10:05:00Z",
  };
}

function readyResponse(lease = "lease-abc"): PreflightVerifyResponse {
  return {
    state: "READY",
    readinessLease: lease,
    readinessExpiresAt: "2026-11-14T10:01:30Z",
    verifiedCameraTrackSid: "track-sid-1",
  };
}

function Harness() {
  const state = useCameraPreflight({ sessionId: 5, cameraRequired: true });
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "status" }, state.status),
    createElement("span", { "data-testid": "lease" }, state.lease?.readinessLease ?? "none"),
    createElement("span", { "data-testid": "error" }, state.lastError ?? "none"),
    createElement("video", { ref: state.previewRef, "data-testid": "preview" }),
    createElement("button", { onClick: state.start }, "start"),
    createElement("button", { onClick: state.retry }, "retry")
  );
}

function statusOf(): string {
  return document.querySelector<HTMLElement>('[data-testid="status"]')!.textContent ?? "";
}

async function clickStart(): Promise<void> {
  await act(async () => {
    document.querySelector<HTMLButtonElement>("button")!.click();
  });
}

let gum: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no WebRTC: stub the global the production code branches on.
  vi.stubGlobal("MediaStream", livekitInternals.__MediaStream);
  livekitInternals.__rooms.length = 0;
  createMock.mockReset().mockResolvedValue(preflightResponse());
  verifyMock.mockReset().mockResolvedValue({ state: "NOT_PUBLISHED" });
  gum = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: gum },
  });
  gum.mockResolvedValue(streamOf(fakeTrack()));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCameraPreflight happy path", () => {
  it("reaches READY with the lease, publishing the SAME preview track", async () => {
    const { container } = render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Permission + preview + connect + publish happened.
    expect(gum).toHaveBeenCalledWith({ video: { width: 640, height: 480 }, audio: false });
    expect(createMock).toHaveBeenCalledWith(5);
    const room = livekitInternals.__rooms[0];
    expect(room).toBeDefined();
    expect(room.connect).toHaveBeenCalledWith("ws://media.test", "pf-token", {
      autoSubscribe: false,
    });
    const published = room.localParticipant.publishTrack.mock.calls[0][0] as MediaStreamTrack;
    const video = container.querySelector("video")!;
    // Same MediaStreamTrack reused between preview attach and publish.
    expect(video.srcObject).toBeInstanceOf(livekitInternals.__MediaStream);
    const attached = video.srcObject as unknown as StubMediaStream;
    expect(attached.tracks).toContain(published);
    expect(statusOf()).toBe("verifying");

    // First poll: NOT_PUBLISHED keeps polling; second poll: READY.
    verifyMock.mockResolvedValueOnce({ state: "NOT_PUBLISHED" }).mockResolvedValueOnce(readyResponse());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(statusOf()).toBe("verifying");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(statusOf()).toBe("ready");
    expect(
      document.querySelector<HTMLElement>('[data-testid="lease"]')!.textContent
    ).toBe("lease-abc");
    // Room stays connected (never disconnected while READY).
    expect(room.disconnect).not.toHaveBeenCalled();
  });

  it("polls at most 10 times before TIMEOUT", async () => {
    render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("verifying");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 2_000);
    });
    expect(statusOf()).toBe("timeout");
    expect(verifyMock).toHaveBeenCalledTimes(10);
  });
});

describe("useCameraPreflight failures", () => {
  it("maps NotAllowedError to DENIED", async () => {
    const err = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    gum.mockRejectedValue(err);
    render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("denied");
    expect(
      document.querySelector<HTMLElement>('[data-testid="error"]')!.textContent
    ).toContain("denied");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("maps NotFoundError to UNAVAILABLE", async () => {
    const err = Object.assign(new Error("no device"), { name: "NotFoundError" });
    gum.mockRejectedValue(err);
    render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("unavailable");
  });

  it("maps MONITORING_INFRA_UNAVAILABLE to INFRA and stops the track", async () => {
    const track = fakeTrack();
    gum.mockResolvedValue(streamOf(track));
    createMock.mockRejectedValue({
      kind: "api",
      status: 503,
      code: "MONITORING_INFRA_UNAVAILABLE",
      message: "infra",
      raw: {},
    });
    render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("infra");
    expect(track.stop).toHaveBeenCalled();
  });

  it("retry() restarts from permission with a fresh track", async () => {
    const { container } = render(createElement(Harness));
    const err = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    gum.mockRejectedValueOnce(err).mockResolvedValue(streamOf(fakeTrack()));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("denied");

    await act(async () => {
      container.querySelectorAll("button")[1].click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gum).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(statusOf()).toBe("verifying");
  });
});

describe("useCameraPreflight cleanup", () => {
  it("disconnects the room and stops the track on unmount", async () => {
    const track = fakeTrack();
    gum.mockResolvedValue(streamOf(track));
    const { unmount } = render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const room = livekitInternals.__rooms[0];
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(room.disconnect).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("keeps a handed-off room's connection AND published track alive", async () => {
    // The track published into the room is the one getUserMedia returned.
    const track = fakeTrack();
    gum.mockResolvedValue(streamOf(track));
    const { unmount } = render(createElement(Harness));
    await clickStart();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    verifyMock.mockResolvedValue(readyResponse());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(statusOf()).toBe("ready");
    const room = livekitInternals.__rooms[0];
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(track, expect.anything());
    // Simulate the parent transferring the room on start success.
    setActivePublisherRoom(room as never);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });
});
