"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Client } from "@stomp/stompjs";
import type { WsStatus } from "./use-stomp-connection";
import type { RealtimeEventEnvelope } from "./types";

/**
 * Subscribe to `/user/queue/attempt` and expose the latest `serverTime` from
 * `SERVER_TIME_SYNC` events. On reconnect (status goes disconnected → connected)
 * the caller's `onReconnect` fires (typically: invalidate REST detail refetch).
 *
 * **No double-subscribe**: the subscription is tracked in a ref; each
 * (re)connect unsubscribes the old before subscribing the new.
 */
export function useServerTimeSync(
  client: Client | null,
  status: WsStatus,
  onReconnect?: () => void
): { serverTime: string | null } {
  const [serverTime, setServerTime] = useState<string | null>(null);
  const subRef = useRef<(() => void) | null>(null);
  const prevConnected = useRef(false);

  // Stable callback ref so the effect doesn't re-run on every render.
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  const handleEvent = useCallback((envelope: RealtimeEventEnvelope) => {
    if (envelope.eventType === "SERVER_TIME_SYNC") {
      setServerTime(envelope.serverTime);
    }
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

    // Fire onReconnect if this is a re-connect (had serverTime before disconnect).
    if (prevConnected.current === false && serverTime !== null) {
      onReconnectRef.current?.();
    }
    prevConnected.current = true;

    if (subRef.current) {
      subRef.current();
      subRef.current = null;
    }

    const sub = client.subscribe("/user/queue/attempt", (msg) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, status, handleEvent]);

  return { serverTime };
}
