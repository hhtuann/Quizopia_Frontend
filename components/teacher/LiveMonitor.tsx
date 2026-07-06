"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  useSessionEvents,
  type SessionMetrics,
  type WsStatus,
} from "@/lib/realtime/use-session-events";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

const EVENT_LABEL: Record<string, string> = {
  SESSION_OPENED: "Session opened",
  SESSION_CLOSED: "Session closed",
  ATTEMPT_STARTED: "Attempt started",
  ATTEMPT_SUBMITTED: "Attempt submitted",
  ACTIVE_COUNT_CHANGED: "Active count changed",
  SERVER_TIME_SYNC: "Time sync",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Teacher live-monitoring dashboard. Reuses FE13 WS abstraction (no connection
 * rewrite). Subscribes to `/topic/exam-sessions/{sessionId}` for real-time
 * events. **Read-only** — no WS mutation (Day 7 has no client commands).
 *
 * Metrics are seeded from REST (session detail's `participantCount` for the
 * baseline) and updated by events. On reconnect, REST queries are invalidated.
 *
 * No answer/studentCode leak — the envelope only carries `studentProfileId` +
 * status + counts.
 */
export function LiveMonitor({
  sessionId,
  initial,
}: {
  sessionId: number;
  initial: SessionMetrics;
}) {
  const queryClient = useQueryClient();

  const { status, metrics, recentEvents } = useSessionEvents(
    sessionId,
    initial,
    () => {
      // Reconnect → REST refetch (source of truth).
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["exam-sessions", sessionId, "participants"],
      });
    }
  );

  return (
    <div className="rounded-container bg-[#E0E5EC] p-6 shadow-extruded">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          Live monitoring
        </h2>
        <ConnectionIndicator status={status} />
      </div>

      {/* Metric cards */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <MetricCard label="Active" value={metrics.activeCount} tone="accent" />
        <MetricCard label="Started" value={metrics.startedCount} />
        <MetricCard label="Submitted" value={metrics.submittedCount} />
      </div>

      {/* Event feed */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          Recent events
        </p>
        <span className="text-xs text-[#A0AEC0]">{metrics.sessionStatus}</span>
      </div>
      <EventFeed events={recentEvents} />
    </div>
  );
}

function ConnectionIndicator({ status }: { status: WsStatus }) {
  const config = {
    connected: { label: "Live", tone: "text-[#38B2AC]" },
    connecting: { label: "Connecting…", tone: "text-[#6C63FF]" },
    disconnected: { label: "Offline", tone: "text-[#A0AEC0]" },
  } as const;
  const { label, tone } = config[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`text-xs font-semibold ${tone}${status === "connecting" ? " animate-pulse" : ""}`}
    >
      ● {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "accent";
}) {
  return (
    <div className="rounded-2xl bg-[#E0E5EC] p-4 text-center shadow-inset-small">
      <p
        className={`text-2xl font-extrabold tabular-nums ${
          tone === "accent" ? "text-[#6C63FF]" : "text-[#3D4852]"
        }`}
        role="status"
        aria-live="polite"
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
        {label}
      </p>
    </div>
  );
}

function EventFeed({ events }: { events: RealtimeEventEnvelope[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl bg-[#E0E5EC] px-4 py-6 text-center text-xs text-[#6B7280] shadow-inset-small">
        No events yet. Live events will appear here when students interact.
      </div>
    );
  }
  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
      {events.map((ev, i) => (
        <li
          key={`${ev.eventId}-${i}`}
          className="flex items-center gap-2 rounded-2xl bg-[#E0E5EC] px-3 py-2 text-xs shadow-inset-small"
        >
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              ev.eventType === "ATTEMPT_SUBMITTED"
                ? "bg-[#38B2AC]"
                : ev.eventType === "ATTEMPT_STARTED"
                ? "bg-[#6C63FF]"
                : "bg-[#6B7280]"
            }`}
            aria-hidden="true"
          />
          <span className="font-semibold text-[#3D4852]">
            {EVENT_LABEL[ev.eventType] ?? ev.eventType}
          </span>
          {ev.studentProfileId != null && (
            <span className="text-[#6B7280]">· profile #{ev.studentProfileId}</span>
          )}
          <span className="ml-auto tabular-nums text-[#A0AEC0]">
            {formatTime(ev.occurredAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
