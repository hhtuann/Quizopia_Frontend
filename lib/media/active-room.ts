"use client";

import type { Room } from "./livekit";

/**
 * Hand-off singleton for the connected publisher room (P4-B).
 *
 * The landing preflight connects a Room and publishes the camera; when the
 * student starts the attempt, the SAME room is transferred to the attempt
 * page instead of connecting a second time (avoids a double publish /
 * DUPLICATE_IDENTITY kick). The attempt page consumes it exactly once via
 * {@link takeActivePublisherRoom} — if absent (e.g. page reload, resume),
 * `useAttemptCamera` self-connects through token renewal.
 *
 * `setActivePublisherRoom` marks the room as transferred: the preflight
 * hook's unmount cleanup must NOT disconnect it afterwards, regardless of
 * mount/unmount ordering during the route transition.
 */

let activeRoom: Room | null = null;
const transferredRooms = new WeakSet<Room>();

export function setActivePublisherRoom(room: Room): void {
  activeRoom = room;
  transferredRooms.add(room);
}

/** Take the transferred room (one-shot; second call returns null). */
export function takeActivePublisherRoom(): Room | null {
  const room = activeRoom;
  activeRoom = null;
  return room;
}

/** True once a room was handed off — its owner is now the attempt page. */
export function isTransferredPublisherRoom(room: Room): boolean {
  return transferredRooms.has(room);
}
