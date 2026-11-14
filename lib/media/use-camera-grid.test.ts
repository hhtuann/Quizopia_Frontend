// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-B teacher grid hook: LOW-layer subscription policy, single-HIGH
 * fullscreen promotion, token-refresh re-join loop, teardown.
 *
 * (.ts, not .tsx — the vitest include globs only pick ".ts" under lib; the
 * harness uses createElement instead of JSX.) livekit-client is mocked with
 * a fake Room that records handlers so tests can emit SDK events directly.
 */

const { tokenCalls, registered, FakeRoom } = vi.hoisted(() => {
  class FakeRoom {
    static instances: FakeRoom[] = [];
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    remoteParticipants = new Map();
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    removeAllListeners = vi.fn();

    constructor() {
      FakeRoom.instances.push(this);
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const cb of this.handlers.get(event) ?? []) cb(...args);
    }
  }
  return {
    tokenCalls: [] as string[],
    registered: [] as Array<[string, unknown]>,
    FakeRoom,
  };
});

vi.mock("@/lib/api/media", () => ({
  getTeacherMediaToken: vi.fn(async () => {
    const token = `tok-${tokenCalls.length + 1}`;
    tokenCalls.push(token);
    return {
      mediaToken: token,
      mediaTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      mediaIdentity: "teacher-1",
      wsUrl: "ws://livekit.test",
      roomScope: "session" as const,
    };
  }),
}));

vi.mock("@/lib/media/test-hooks", () => ({
  registerMediaRoom: vi.fn((scope: string, room: unknown) => {
    registered.push([scope, room]);
  }),
}));

vi.mock("livekit-client", () => ({
  Room: FakeRoom,
  VideoQuality: { LOW: 0, MEDIUM: 1, HIGH: 2 },
  ConnectionQuality: {
    Excellent: "excellent",
    Good: "good",
    Poor: "poor",
    Lost: "lost",
    Unknown: "unknown",
  },
  Track: {
    Source: { Camera: "camera", Microphone: "microphone", Unknown: "unknown" },
    Kind: { Video: "video", Audio: "audio", Unknown: "unknown" },
  },
  RoomEvent: {
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackPublished: "trackPublished",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    ConnectionQualityChanged: "connectionQualityChanged",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
    Disconnected: "disconnected",
  },
}));

import { useCameraGrid, isCameraGridActivity } from "./use-camera-grid";

const VIDEO_QUALITY = { LOW: 0, MEDIUM: 1, HIGH: 2 };

type Grid = ReturnType<typeof useCameraGrid>;

// Latest hook result, captured in an effect (React Compiler forbids
// mutating props; tests read this after act() flushes effects).
let gridResult: Grid | null = null;

function Harness() {
  const grid = useCameraGrid(5, true);
  useEffect(() => {
    gridResult = grid;
  }, [grid]);
  return null;
}

function cameraPublication(source = "camera") {
  return {
    source,
    isSubscribed: false,
    isMuted: false,
    setSubscribed: vi.fn(),
    setVideoQuality: vi.fn(),
  };
}

function videoTrack() {
  return { kind: "video", attach: vi.fn(), detach: vi.fn() };
}

async function mount() {
  gridResult = null;
  render(createElement(Harness));
  await act(async () => {});
}

beforeEach(() => {
  tokenCalls.length = 0;
  registered.length = 0;
  FakeRoom.instances = [];
});

afterEach(() => {
  cleanup();
});

describe("useCameraGrid (teacher viewer)", () => {
  it("connects once with a fresh teacher token and autoSubscribe:false", async () => {
    await mount();
    expect(tokenCalls).toEqual(["tok-1"]);
    const room = FakeRoom.instances[0];
    expect(room).toBeDefined();
    expect(room.connect).toHaveBeenCalledWith("ws://livekit.test", "tok-1", {
      autoSubscribe: false,
    });
    expect(registered).toContainEqual(["teacher", room]);
  });

  it("subscribes every camera publisher at the LOW grid layer only", async () => {
    await mount();
    const room = FakeRoom.instances[0];
    const pub = cameraPublication();

    act(() => {
      room.emit("participantConnected", { identity: "stu-1" });
      room.emit("trackPublished", pub, { identity: "stu-1" });
    });
    expect(pub.setSubscribed).toHaveBeenCalledWith(true);
    expect(pub.setVideoQuality).not.toHaveBeenCalled();

    const track = videoTrack();
    act(() => {
      room.emit("trackSubscribed", track, pub, { identity: "stu-1" });
    });
    expect(pub.setVideoQuality).toHaveBeenCalledWith(VIDEO_QUALITY.LOW);
    expect(gridResult?.tiles.get("stu-1")?.track).toBe(track);
    expect(gridResult?.status).toBe("live");

    // OS-level camera mute/unmute is surfaced per tile (frozen-frame flag).
    act(() => {
      room.emit("trackMuted", pub, { identity: "stu-1" });
    });
    expect(gridResult?.tiles.get("stu-1")?.muted).toBe(true);
    act(() => {
      room.emit("trackUnmuted", pub, { identity: "stu-1" });
    });
    expect(gridResult?.tiles.get("stu-1")?.muted).toBe(false);
  });

  it("never subscribes non-camera publications", async () => {
    await mount();
    const room = FakeRoom.instances[0];
    const mic = cameraPublication("microphone");
    act(() => {
      room.emit("trackPublished", mic, { identity: "stu-1" });
    });
    expect(mic.setSubscribed).not.toHaveBeenCalled();
  });

  it("promotes exactly one tile to HIGH for fullscreen and demotes the previous", async () => {
    await mount();
    const room = FakeRoom.instances[0];
    const pubA = cameraPublication();
    const pubB = cameraPublication();
    act(() => {
      room.emit("trackSubscribed", videoTrack(), pubA, { identity: "stu-a" });
      room.emit("trackSubscribed", videoTrack(), pubB, { identity: "stu-b" });
    });
    act(() => {
      gridResult?.selectForFullscreen("stu-a");
    });
    expect(pubA.setVideoQuality).toHaveBeenLastCalledWith(VIDEO_QUALITY.HIGH);
    expect(gridResult?.fullscreenIdentity).toBe("stu-a");

    act(() => {
      gridResult?.selectForFullscreen("stu-b");
    });
    expect(pubA.setVideoQuality).toHaveBeenLastCalledWith(VIDEO_QUALITY.LOW);
    expect(pubB.setVideoQuality).toHaveBeenLastCalledWith(VIDEO_QUALITY.HIGH);

    act(() => {
      gridResult?.selectForFullscreen(null);
    });
    expect(pubB.setVideoQuality).toHaveBeenLastCalledWith(VIDEO_QUALITY.LOW);
    expect(gridResult?.fullscreenIdentity).toBeNull();
  });

  it("keeps connection quality per tile", async () => {
    await mount();
    const room = FakeRoom.instances[0];
    act(() => {
      room.emit("participantConnected", { identity: "stu-1" });
      room.emit("connectionQualityChanged", "poor", { identity: "stu-1" });
    });
    expect(gridResult?.tiles.get("stu-1")?.connectionQuality).toBe("poor");
  });

  it("drops a tile when its participant leaves", async () => {
    await mount();
    const room = FakeRoom.instances[0];
    act(() => {
      room.emit("participantConnected", { identity: "stu-1" });
    });
    expect(gridResult?.tiles.has("stu-1")).toBe(true);
    act(() => {
      room.emit("participantDisconnected", { identity: "stu-1" });
    });
    expect(gridResult?.tiles.has("stu-1")).toBe(false);
  });

  it("re-joins with a FRESH token after an unexpected disconnect (backoff)", async () => {
    vi.useFakeTimers();
    try {
      await mount();
      const room1 = FakeRoom.instances[0];
      act(() => {
        room1.emit("disconnected");
      });
      expect(gridResult?.status).toBe("offline");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(tokenCalls).toEqual(["tok-1", "tok-2"]);
      const room2 = FakeRoom.instances[1];
      expect(room2).toBeDefined();
      expect(room2.connect).toHaveBeenCalledWith("ws://livekit.test", "tok-2", {
        autoSubscribe: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("disconnects the room on unmount and schedules no reconnect", async () => {
    vi.useFakeTimers();
    try {
      const view = await (async () => {
        const v = render(createElement(Harness));
        await act(async () => {});
        return v;
      })();
      const room = FakeRoom.instances[0];
      view.unmount();
      expect(room.disconnect).toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(tokenCalls).toEqual(["tok-1"]);
      expect(FakeRoom.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isCameraGridActivity", () => {
  const envelope = (activityType?: string): RealtimeEventEnvelope =>
    ({
      eventId: "e1",
      eventType: "ATTEMPT_ACTIVITY",
      sessionId: 5,
      attemptId: 7,
      occurredAt: "2026-01-01T00:00:00Z",
      serverTime: "2026-01-01T00:00:00Z",
      activityType,
      activitySource: "SERVER",
    }) as RealtimeEventEnvelope;

  it("matches CAMERA_* and MONITORING_GAP activity", () => {
    expect(isCameraGridActivity(envelope("CAMERA_CONNECTED"))).toBe(true);
    expect(isCameraGridActivity(envelope("CAMERA_DISCONNECTED"))).toBe(true);
    expect(isCameraGridActivity(envelope("CAMERA_RECONNECTED"))).toBe(true);
    expect(isCameraGridActivity(envelope("CAMERA_REVOKED"))).toBe(true);
    expect(isCameraGridActivity(envelope("MONITORING_GAP"))).toBe(true);
  });

  it("rejects answer/navigation activity and camera-less envelopes", () => {
    expect(isCameraGridActivity(envelope("ANSWER_SELECTED"))).toBe(false);
    expect(isCameraGridActivity(envelope(undefined))).toBe(false);
  });
});
