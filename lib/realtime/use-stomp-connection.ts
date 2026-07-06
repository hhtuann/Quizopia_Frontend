"use client";

import { useEffect, useState } from "react";
import { Client } from "@stomp/stompjs";
import { createStompClient, type WsStatus } from "./ws-client";

export type { WsStatus };

/**
 * Manages the STOMP connection lifecycle. Creates the client eagerly (lazy
 * `useState` initializer — the constructor doesn't open a socket), then
 * `activate()` / `deactivate()` in the effect. All status updates come from
 * stompjs callbacks (not setState in the effect body).
 *
 * The caller must guard `enabled` to only mount this hook when the student is
 * on an IN_PROGRESS attempt page.
 */
export function useStompConnection(enabled: boolean): {
  status: WsStatus;
  client: Client | null;
} {
  const [status, setStatus] = useState<WsStatus>("disconnected");

  // Create the client once (lazy initializer — no socket opened yet).
  // `enabled` is captured at first render; in practice this hook is always
  // called with enabled=true (inside InProgressShell).
  const [client] = useState(() => {
    if (!enabled) return null;
    return createStompClient({
      onConnect: () => {},
      onStatusChange: (s) => setStatus(s),
    });
  });

  useEffect(() => {
    if (!client) return;
    client.activate();
    return () => {
      client.deactivate();
      setStatus("disconnected");
    };
  }, [client]);

  return { status, client };
}
