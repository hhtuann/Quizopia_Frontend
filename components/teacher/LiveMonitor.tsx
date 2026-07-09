"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  useSessionEvents,
  type SessionMetrics,
  type WsStatus,
} from "@/lib/realtime/use-session-events";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";
import { SectionLabel, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

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
    <div className={cn(cardVariants(), "mt-6 p-6")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <SectionLabel className="mb-2">Realtime</SectionLabel>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Live monitoring
          </h2>
        </div>
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
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          Recent events
        </p>
        <span className="text-xs text-[#94A3B8]">{metrics.sessionStatus}</span>
      </div>
      <EventFeed events={recentEvents} />
    </div>
  );
}

function ConnectionIndicator({ status }: { status: WsStatus }) {
  const config = {
    connected: { label: "Live", tone: "text-[#10B981]" },
    connecting: { label: "Connecting…", tone: "text-[#0052FF]" },
    disconnected: { label: "Offline", tone: "text-[#94A3B8]" },
  } as const;
  const { label, tone } = config[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-xs font-semibold", tone, status === "connecting" && "animate-pulse")}
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
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 text-center shadow-sm">
      <p
        className={cn(
          "text-2xl font-extrabold tabular-nums",
          tone === "accent" ? "text-[#0052FF]" : "text-[#0F172A]"
        )}
        role="status"
        aria-live="polite"
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-xs uppercase tracking-wide text-[#64748B]">
        {label}
      </p>
    </div>
  );
}

function EventFeed({ events }: { events: RealtimeEventEnvelope[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F1F5F9]/50 px-4 py-6 text-center text-xs text-[#64748B]">
        No events yet. Live events will appear here when students interact.
      </div>
    );
  }
  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
      {events.map((ev, i) => (
        <li
          key={`${ev.eventId}-${i}`}
          className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2 text-xs"
        >
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              ev.eventType === "ATTEMPT_SUBMITTED"
                ? "bg-[#10B981]"
                : ev.eventType === "ATTEMPT_STARTED"
                ? "bg-[#0052FF]"
                : "bg-[#64748B]"
            )}
            aria-hidden="true"
          />
          <span className="font-semibold text-[#0F172A]">
            {EVENT_LABEL[ev.eventType] ?? ev.eventType}
          </span>
          {ev.studentProfileId != null && (
            <span className="text-[#64748B]">· profile #{ev.studentProfileId}</span>
          )}
          <span className="ml-auto tabular-nums text-[#94A3B8]">
            {formatTime(ev.occurredAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
