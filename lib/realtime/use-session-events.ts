"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStompConnection, type WsStatus } from "./use-stomp-connection";
import type { RealtimeEventEnvelope } from "./types";

export type { WsStatus };

export interface SessionMetrics {
  activeCount: number;
  startedCount: number;
  submittedCount: number;
  sessionStatus: string;
}

const MAX_FEED = 20;

/**
 * Teacher live-monitoring hook. Reuses FE13's `useStompConnection` (no
 * connection rewrite) and subscribes to `/topic/exam-sessions/{sessionId}` for
 * real-time events (ACTIVE_COUNT_CHANGED, ATTEMPT_STARTED, ATTEMPT_SUBMITTED,
 * SESSION_OPENED, SESSION_CLOSED).
 *
 * **Metrics are seeded from REST** (caller passes initial values from the
 * session detail) and **updated by events** — not event-only (avoids missing
 * state before page load).
 *
 * On reconnect, `onReconnect` fires so the caller can invalidate REST queries
 * (session detail + participants) — REST is the source of truth.
 *
 * On a new `ATTEMPT_STARTED` event, `onParticipantStarted` fires (issue #4
 * P0-R5): the roster must be refetched so profile-less PUBLIC learners —
 * who only appear in the roster once they actually start — become
 * resolvable in the event feed immediately, not just after a reconnect.
 *
 * P4-A4: `ATTEMPT_ACTIVITY` envelopes (one per durable activity event) are
 * high-frequency; they are NOT pushed into `recentEvents` — the session
 * detail's Activity panel subscribes via `onAttemptActivity` and refetches
 * the timeline from REST (source of truth).
 */
export function useSessionEvents(
  sessionId: number,
  initial: SessionMetrics,
  onReconnect?: () => void,
  onParticipantStarted?: (ev: RealtimeEventEnvelope) => void,
  onAttemptActivity?: (ev: RealtimeEventEnvelope) => void
): {
  status: WsStatus;
  metrics: SessionMetrics;
  recentEvents: RealtimeEventEnvelope[];
} {
  const { status, client } = useStompConnection(true);

  const [metrics, setMetrics] = useState<SessionMetrics>(initial);
  const [recentEvents, setRecentEvents] = useState<RealtimeEventEnvelope[]>([]);
  const subRef = useRef<(() => void) | null>(null);
  const prevConnected = useRef(false);
  const everConnected = useRef(false);

  // Stable onReconnect ref (avoids effect re-run + lint ref-during-render).
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  // Stable onParticipantStarted ref (issue #4 P0-R5).
  const onParticipantStartedRef = useRef(onParticipantStarted);
  useEffect(() => {
    onParticipantStartedRef.current = onParticipantStarted;
  }, [onParticipantStarted]);

  // Stable onAttemptActivity ref (P4-A4).
  const onAttemptActivityRef = useRef(onAttemptActivity);
  useEffect(() => {
    onAttemptActivityRef.current = onAttemptActivity;
  }, [onAttemptActivity]);

  const handleEvent = useCallback((envelope: RealtimeEventEnvelope) => {
    // P4-A4: activity deltas go to the dedicated subscriber (REST refetch),
    // never into the capped lifecycle feed.
    if (envelope.eventType === "ATTEMPT_ACTIVITY") {
      onAttemptActivityRef.current?.(envelope);
      return;
    }

    setRecentEvents((prev) => [envelope, ...prev].slice(0, MAX_FEED));

    // Roster refresh on first-time participants (P0-R5): the user only
    // enters the roster when they actually start an attempt.
    if (envelope.eventType === "ATTEMPT_STARTED") {
      onParticipantStartedRef.current?.(envelope);
    }

    setMetrics((prev) => {
      const next = { ...prev };
      switch (envelope.eventType) {
        case "ACTIVE_COUNT_CHANGED":
          if (envelope.activeCount != null) next.activeCount = envelope.activeCount;
          break;
        case "ATTEMPT_STARTED":
          next.startedCount = prev.startedCount + 1;
          if (envelope.activeCount != null) next.activeCount = envelope.activeCount;
          break;
        case "ATTEMPT_SUBMITTED":
          next.submittedCount = prev.submittedCount + 1;
          if (envelope.activeCount != null) next.activeCount = envelope.activeCount;
          break;
        case "SESSION_OPENED":
          next.sessionStatus = "OPEN";
          break;
        case "SESSION_CLOSED":
          next.sessionStatus = "CLOSED";
          break;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!client || status !== "connected") {
      if (subRef.current) {
        subRef.current();
        subRef.current = null;
      }
      prevConnected.current = false;
      return;
    }

    // Fire onReconnect on any reconnect after the first-ever connect
    // (not just when metrics changed — uses everConnected flag to avoid
    // the serverTime-null edge from FE13's use-server-time-sync).
    if (everConnected.current) {
      onReconnectRef.current?.();
    }
    everConnected.current = true;
    prevConnected.current = true;

    // Unsubscribe any existing before re-subscribing (no double-subscribe).
    if (subRef.current) {
      subRef.current();
      subRef.current = null;
    }

    const destination = `/topic/exam-sessions/${sessionId}`;
    const sub = client.subscribe(destination, (msg) => {
      try {
        handleEvent(JSON.parse(msg.body) as RealtimeEventEnvelope);
      } catch {
        // Ignore malformed messages.
      }
    });
    subRef.current = () => sub.unsubscribe();

    return () => {
      if (subRef.current) {
        subRef.current();
        subRef.current = null;
      }
    };
  }, [client, status, sessionId, handleEvent]);

  return { status, metrics, recentEvents };
}
