"use client";

import { Client, type IMessage } from "@stomp/stompjs";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Derive the STOMP brokerURL from NEXT_PUBLIC_API_URL.
 * http → ws, https → wss, append `/ws`.
 * Empty env → empty brokerURL (caller should not activate).
 */
function deriveBrokerURL(): string {
  const httpBase = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (!httpBase) return "";
  const wsBase = httpBase.replace(/^http/, "ws"); // http→ws, https→wss
  return `${wsBase}/ws`;
}

export type WsStatus = "disconnected" | "connecting" | "connected";

/**
 * Create a configured STOMP client (@stomp/stompjs v7).
 *
 * **Bearer token in CONNECT header** — read FRESH from the auth store on each
 * (re)connect via `beforeConnect` callback. The token is NEVER in a query param
 * or URL. No SockJS — raw WebSocket.
 *
 * The caller manages `activate()` / `deactivate()`. On each reconnect the
 * `beforeConnect` fires, refreshing the token, then `onConnect` fires for
 * re-subscription.
 */
export function createStompClient(opts: {
  onConnect: () => void;
  onStatusChange: (status: WsStatus) => void;
}): Client {
  const brokerURL = deriveBrokerURL();

  const client = new Client({
    brokerURL,
    reconnectDelay: 5000,

    // Read the LATEST token from the auth store on every (re)connect.
    // This closure is called by stompjs before each CONNECT attempt.
    beforeConnect: () => {
      const token = useAuthStore.getState().accessToken;
      client.connectHeaders = token
        ? { Authorization: `Bearer ${token}` }
        : {};
    },

    onConnect: () => {
      opts.onStatusChange("connected");
      opts.onConnect();
    },

    onDisconnect: () => {
      opts.onStatusChange("disconnected");
    },

    onStompError: (frame) => {
      // Log code/message only — NEVER the token or frame body.
      console.error("[ws-client] STOMP error:", frame.headers["message"]);
      opts.onStatusChange("disconnected");
    },

    onWebSocketError: (ev) => {
      console.error("[ws-client] WebSocket error:", ev.type);
      // stompjs will auto-reconnect via reconnectDelay; status stays "connecting".
    },
  });

  return client;
}

/** Convenience: subscribe + return unsubscribe cleanup. */
export function stompSubscribe(
  client: Client,
  destination: string,
  cb: (msg: IMessage) => void
): () => void {
  const sub = client.subscribe(destination, cb);
  return () => sub.unsubscribe();
}
