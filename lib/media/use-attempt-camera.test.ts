// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttemptCamera } from "./use-attempt-camera";
import { setActivePublisherRoom } from "./active-room";
import { getRegisteredMediaRoom } from "./test-hooks";
import type { MediaTokenResponse } from "@/lib/api/media";
import type { NormalizedApiError } from "@/lib/api";
import type { Room } from "./livekit";
/**
 * P4-B attempt camera maintenance: renewal → connect+publish → verified;
 * 409 NOT_APPLICABLE no-ops to inactive; Disconnected → reconnecting with a
 * FRESH token per retry; 403 REVOKED is terminal (no further retries); the
 * landing hand-off room is adopted without a second connect; unmount
 * disconnects and clears the registry.
 */

vi.mock("@/lib/api/media", () => ({
  renewAttemptMediaToken: vi.fn(),
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
  return {
    Room: FakeRoom,
    RoomEvent: { Disconnected: "disconnected", Connected: "connected" },
    Track: { Source: { Camera: "camera" } },
    VideoPresets: { h360: { encoding: { maxBitrate: 500_000 } } },
    __rooms: rooms,
  };
});

interface FakeRoomShape {
  state: string;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  localParticipant: { publishTrack: ReturnType<typeof vi.fn> };
  on: (evt: string, cb: () => void) => unknown;
  removeAllListeners: (evt: string) => void;
  emit: (evt: string) => void;
}

import { renewAttemptMediaToken } from "@/lib/api/media";
import * as livekitModule from "livekit-client";

const renewMock = vi.mocked(renewAttemptMediaToken);
const livekitInternals = livekitModule as unknown as { __rooms: FakeRoomShape[] };

function tokenResponse(n: number): MediaTokenResponse {
  return {
    mediaToken: `tok-${n}`,
    mediaTokenExpiresAt: "2026-11-14T10:02:00Z",
    mediaIdentity: "media-id",
    wsUrl: "ws://media.test",
    roomScope: "session",
  };
}

function apiError(status: number, code: string): NormalizedApiError {
  return { kind: "api", status, code, message: code, raw: {} };
}

function fakeTrack(): MediaStreamTrack {
  return { stop: vi.fn(), readyState: "live" } as unknown as MediaStreamTrack;
}

function streamOf(track: MediaStreamTrack): MediaStream {
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

function Harness({ attemptId = 9 }: { attemptId?: number }) {
  const { status } = useAttemptCamera(attemptId);
  return createElement("span", { "data-testid": "status" }, status);
}

function statusOf(): string {
  return document.querySelector<HTMLElement>('[data-testid="status"]')!.textContent ?? "";
}

let gum: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  livekitInternals.__rooms.length = 0;
  renewMock.mockReset().mockResolvedValue(tokenResponse(1));
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
});

describe("useAttemptCamera mount", () => {
  it("renewal 409 NOT_APPLICABLE → inactive and never constructs a room", async () => {
    renewMock.mockRejectedValue(apiError(409, "MONITORING_PREFLIGHT_NOT_APPLICABLE"));
    render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("inactive");
    expect(livekitInternals.__rooms).toHaveLength(0);
    // No retry loop for a terminal state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(renewMock).toHaveBeenCalledTimes(1);
  });

  it("renews, connects and publishes → verified, registered for tests", async () => {
    render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("verified");
    expect(renewMock).toHaveBeenCalledWith(9);
    const room = livekitInternals.__rooms[0];
    expect(room.connect).toHaveBeenCalledWith("ws://media.test", "tok-1", {
      autoSubscribe: false,
    });
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    expect(getRegisteredMediaRoom("attempt")).toBe(room);
  });

  it("renewal 409 BINDING_MISSING → unbound (informational, no retry)", async () => {
    renewMock.mockRejectedValue(apiError(409, "MONITORING_BINDING_MISSING"));
    render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("unbound");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(renewMock).toHaveBeenCalledTimes(1);
  });

  it("adopts the landing page's handed-off room without a second connect", async () => {
    const handedOff: FakeRoomShape = {
      state: "connected",
      connect: vi.fn(),
      disconnect: vi.fn(async () => undefined),
      localParticipant: { publishTrack: vi.fn() },
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      emit: vi.fn(),
    };
    setActivePublisherRoom(handedOff as unknown as Room);
    render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("verified");
    expect(renewMock).not.toHaveBeenCalled();
    expect(handedOff.connect).not.toHaveBeenCalled();
    expect(getRegisteredMediaRoom("attempt")).toBe(handedOff);
  });
});

describe("useAttemptCamera disconnect recovery", () => {
  it("Disconnected → reconnecting → retry renews a FRESH token and reconnects", async () => {
    render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const first = livekitInternals.__rooms[0];
    expect(statusOf()).toBe("verified");

    act(() => {
      first.emit("disconnected");
    });
    expect(statusOf()).toBe("reconnecting");

    renewMock.mockResolvedValue(tokenResponse(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(statusOf()).toBe("verified");
    expect(renewMock).toHaveBeenCalledTimes(2);
    const second = livekitInternals.__rooms[1];
    expect(second).toBeDefined();
    expect(second.connect).toHaveBeenCalledWith("ws://media.test", "tok-2", {
      autoSubscribe: false,
    });
    // The dead room was replaced in the registry.
    expect(getRegisteredMediaRoom("attempt")).toBe(second);
  });

  it("403 REVOKED on renewal retry stops with no further attempts", async () => {
    render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      livekitInternals.__rooms[0].emit("disconnected");
    });
    expect(statusOf()).toBe("reconnecting");

    renewMock.mockRejectedValueOnce(apiError(403, "MONITORING_CAMERA_REVOKED"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(statusOf()).toBe("revoked");
    const callsAfterRevoke = renewMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(renewMock.mock.calls.length).toBe(callsAfterRevoke);
  });

  it("unmount disconnects the room and clears the registry", async () => {
    const { unmount } = render(createElement(Harness));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const room = livekitInternals.__rooms[0];
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(room.disconnect).toHaveBeenCalled();
    expect(getRegisteredMediaRoom("attempt")).toBeNull();
  });
});
