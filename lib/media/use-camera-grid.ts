"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  ConnectionQuality,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type TrackPublication,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
} from "livekit-client";
import { getTeacherMediaToken } from "@/lib/api/media";
import { registerMediaRoom } from "@/lib/media/test-hooks";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-B teacher camera grid (issues #84–#87, ADR-008). The teacher joins the
 * session's LiveKit room with a subscribe-only token (`getTeacherMediaToken`,
 * sub=`teacher-{userId}` minted server-side) and subscribes to EVERY camera
 * publisher at the LOW simulcast layer — "no high-quality subscriptions for
 * all tiles". One track at a time may be promoted to HIGH for fullscreen
 * (`selectForFullscreen`); the previous one drops back to LOW.
 *
 * NOTE (livekit-client 2.24.1): layer selection lives on the
 * `RemoteTrackPublication` (`setVideoQuality`), not on the track. The
 * subscribe-side surface (VideoQuality + remote types) is not re-exported by
 * `./livekit` (publisher-only), so this module imports livekit-client
 * directly.
 *
 * Tokens are short-lived (120s) and the SDK cannot renew them itself, so an
 * unexpected `Disconnected` triggers a full re-join with a FRESH token
 * (exponential backoff 2s→10s, mirroring ws-client's reconnect pattern).
 * REST camera-status (see `getCameraStatus`) stays the roster/state source of
 * truth; this hook only carries live media + connection quality.
 */

/** Reconnect backoff bounds after an unexpected room disconnect. */
const RECONNECT_BACKOFF_START_MS = 2_000;
const RECONNECT_BACKOFF_MAX_MS = 10_000;

export type CameraGridStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";

/** Live media state of one media identity (keyed by LiveKit identity). */
export interface CameraTileMedia {
  identity: string;
  /** Null while (re)connecting or unsubscribed — the tile renders a placeholder. */
  track: RemoteVideoTrack | null;
  /** Owning publication — the simulcast layer control surface. */
  publication: RemoteTrackPublication | null;
  muted: boolean;
  connectionQuality: ConnectionQuality;
}

export type CameraTiles = Map<string, CameraTileMedia>;

/**
 * True when an ATTEMPT_ACTIVITY envelope concerns the camera grid — i.e. it
 * must invalidate `["exam-sessions", id, "camera-status"]` (REST = truth).
 */
export function isCameraGridActivity(ev: RealtimeEventEnvelope): boolean {
  const type = ev.activityType;
  return type != null && (type.startsWith("CAMERA_") || type === "MONITORING_GAP");
}

function blankTile(identity: string): CameraTileMedia {
  return {
    identity,
    track: null,
    publication: null,
    muted: false,
    connectionQuality: ConnectionQuality.Unknown,
  };
}

export function useCameraGrid(
  sessionId: number,
  enabled: boolean
): {
  status: CameraGridStatus;
  tiles: CameraTiles;
  fullscreenIdentity: string | null;
  selectForFullscreen: (identity: string | null) => void;
} {
  const [status, setStatus] = useState<CameraGridStatus>("idle");
  const [tiles, setTiles] = useState<CameraTiles>(new Map());
  const [fullscreenIdentity, setFullscreenIdentity] = useState<string | null>(null);

  const tilesRef = useRef<CameraTiles>(new Map());
  const fullscreenRef = useRef<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  const selectForFullscreen = useCallback((identity: string | null) => {
    const prevId = fullscreenRef.current;
    if (prevId === identity) return;
    // Demote the previous fullscreen tile back to the LOW grid layer.
    const prevTile = prevId != null ? tilesRef.current.get(prevId) : undefined;
    prevTile?.publication?.setVideoQuality(VideoQuality.LOW);
    const nextTile = identity != null ? tilesRef.current.get(identity) : undefined;
    nextTile?.publication?.setVideoQuality(VideoQuality.HIGH);
    fullscreenRef.current = identity;
    setFullscreenIdentity(identity);
  }, []);

  useEffect(() => {
    if (!enabled || !Number.isFinite(sessionId) || sessionId <= 0) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = RECONNECT_BACKOFF_START_MS;

    const commitTiles = (next: CameraTiles) => {
      tilesRef.current = next;
      setTiles(next);
    };

    const upsertTile = (identity: string, patch: Partial<CameraTileMedia>) => {
      const prev = tilesRef.current;
      const next = new Map(prev);
      next.set(identity, { ...(prev.get(identity) ?? blankTile(identity)), ...patch });
      commitTiles(next);
    };

    const closeRoom = (room: Room) => {
      room.removeAllListeners();
      if (roomRef.current === room) roomRef.current = null;
      registerMediaRoom("teacher", null);
      void room.disconnect().catch(() => {});
    };

    const scheduleReconnect = () => {
      if (cancelled || retryTimer != null) return;
      retryTimer = setTimeout(
        () => {
          retryTimer = undefined;
          void connect();
        },
        backoffMs
      );
      backoffMs = Math.min(backoffMs * 2, RECONNECT_BACKOFF_MAX_MS);
    };

    /** (Re)subscribe every connected publisher's camera track. */
    const subscribeCameras = (room: Room) => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.source !== Track.Source.Camera) continue;
          if (!publication.isSubscribed) publication.setSubscribed(true);
        }
      }
    };

    /** Re-assert the LOW grid layer / single HIGH fullscreen policy. */
    const applyQualityPolicy = () => {
      for (const tile of tilesRef.current.values()) {
        tile.publication?.setVideoQuality(
          tile.identity === fullscreenRef.current ? VideoQuality.HIGH : VideoQuality.LOW
        );
      }
    };

    const bindRoom = (room: Room) => {
      room
        .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          if (tilesRef.current.has(participant.identity)) return;
          const next = new Map(tilesRef.current);
          next.set(participant.identity, blankTile(participant.identity));
          commitTiles(next);
        })
        .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          if (!tilesRef.current.has(participant.identity)) return;
          const next = new Map(tilesRef.current);
          next.delete(participant.identity);
          commitTiles(next);
          if (fullscreenRef.current === participant.identity) selectForFullscreen(null);
        })
        .on(
          RoomEvent.TrackPublished,
          (publication: RemoteTrackPublication) => {
            // Subscribe policy: every camera publisher gets a tile (≤10 in the
            // local demo) — but only ever at the LOW layer.
            if (publication.source === Track.Source.Camera) {
              publication.setSubscribed(true);
            }
          }
        )
        .on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant
          ) => {
            if (publication.source !== Track.Source.Camera || track.kind !== Track.Kind.Video) {
              return;
            }
            publication.setVideoQuality(
              fullscreenRef.current === participant.identity
                ? VideoQuality.HIGH
                : VideoQuality.LOW
            );
            upsertTile(participant.identity, {
              track: track as RemoteVideoTrack,
              publication,
              muted: publication.isMuted,
            });
          }
        )
        .on(
          RoomEvent.TrackUnsubscribed,
          (
            _track: RemoteTrack,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant
          ) => {
            if (publication.source !== Track.Source.Camera) return;
            upsertTile(participant.identity, { track: null });
          }
        )
        .on(
          RoomEvent.TrackMuted,
          (publication: TrackPublication, participant: Participant) => {
            if (publication.source !== Track.Source.Camera) return;
            upsertTile(participant.identity, { muted: true });
          }
        )
        .on(
          RoomEvent.TrackUnmuted,
          (publication: TrackPublication, participant: Participant) => {
            if (publication.source !== Track.Source.Camera) return;
            upsertTile(participant.identity, { muted: false });
          }
        )
        .on(
          RoomEvent.ConnectionQualityChanged,
          (quality: ConnectionQuality, participant: Participant) => {
            if (tilesRef.current.has(participant.identity)) {
              upsertTile(participant.identity, { connectionQuality: quality });
            }
          }
        )
        .on(RoomEvent.Reconnecting, () => {
          if (!cancelled) setStatus("reconnecting");
        })
        .on(RoomEvent.Reconnected, () => {
          if (cancelled) return;
          setStatus("live");
          subscribeCameras(room);
          applyQualityPolicy();
        })
        .on(RoomEvent.Disconnected, () => {
          if (cancelled) return;
          // SDK gave up (e.g. expired token) — re-join with a fresh one.
          closeRoom(room);
          setStatus("offline");
          scheduleReconnect();
        });
    };

    const connect = async () => {
      if (cancelled) return;
      setStatus("connecting");
      let room: Room | null = null;
      try {
        const token = await getTeacherMediaToken(sessionId);
        if (cancelled) return;
        room = new Room();
        roomRef.current = room;
        bindRoom(room);
        registerMediaRoom("teacher", room);
        await room.connect(token.wsUrl, token.mediaToken, { autoSubscribe: false });
        if (cancelled) {
          closeRoom(room);
          return;
        }
        backoffMs = RECONNECT_BACKOFF_START_MS;
        setStatus("live");
        // Participants that published before we finished joining.
        subscribeCameras(room);
      } catch {
        if (cancelled) return;
        if (room) closeRoom(room);
        setStatus("offline");
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      const room = roomRef.current;
      if (room) closeRoom(room);
      commitTiles(new Map());
      if (fullscreenRef.current != null) {
        fullscreenRef.current = null;
        setFullscreenIdentity(null);
      }
      setStatus("idle");
    };
  }, [sessionId, enabled, selectForFullscreen]);

  return { status, tiles, fullscreenIdentity, selectForFullscreen };
}
