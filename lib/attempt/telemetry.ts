import {
  ingestActivityEvents,
  isClientActivityEventType,
  retryAfterSeconds,
  type ActivityEventInput,
  type ClientActivityEventType,
  type IngestActivityEventsResponse,
} from "@/lib/api/monitoring";

/**
 * Attempt telemetry emitter (Phase 4-A) — module-scope, NOT React state.
 *
 * Contract:
 *   - bounded queue (default 100, drop-oldest, dropped counter reported);
 *   - flush when >= `flushThreshold` events are queued OR every
 *     `flushIntervalMs` (fire-and-forget — NEVER blocks or delays autosave;
 *     telemetry uses its own endpoint);
 *   - per-event UUID (`eventId` = idempotency key) + monotonic
 *     `clientSequence` starting at 0;
 *   - batches of <= 25 (server batch limit);
 *   - retry on failure with the SAME eventIds, max 3 attempts per batch, then
 *     drop;
 *   - 429 → backoff honouring Retry-After when parseable (capped 60s);
 *   - metadata must stay <= 2KB serialized and never contain answer payloads
 *     or tokens — oversized/unserializable metadata is dropped, not truncated.
 *
 * One instance per attempt is alive at a time (`createAttemptTelemetry`
 * returns the live singleton for the same attemptId — re-renders and remounts
 * never duplicate emitters or events). `resetAttemptTelemetry` is for tests.
 */

const DEFAULT_MAX_QUEUE = 100;
const DEFAULT_FLUSH_THRESHOLD = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 3_000;
const MAX_BATCH_SIZE = 25;
const MAX_SEND_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_METADATA_BYTES = 2_048;

function randomEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Strip metadata that would breach the 2KB server limit (or not serialize). */
function sanitizeMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (metadata == null) return undefined;
  try {
    const serialized = JSON.stringify(metadata);
    return serialized.length <= MAX_METADATA_BYTES ? metadata : undefined;
  } catch {
    return undefined;
  }
}

/** Backoff before the next send attempt: Retry-After (capped) or exponential. */
export function telemetryRetryDelayMs(err: unknown, attempt: number): number {
  const retryAfter = retryAfterSeconds(err);
  if (retryAfter != null) {
    return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  }
  return attempt * 1000;
}

export interface TelemetryStats {
  queued: number;
  sent: number;
  dropped: number;
  /** Batches abandoned after MAX_SEND_ATTEMPTS failures. */
  failedBatches: number;
}

export type TelemetrySendFn = (
  attemptId: number,
  events: ActivityEventInput[]
) => Promise<IngestActivityEventsResponse>;

export interface TelemetryOptions {
  clientInstanceId?: string;
  /** Injectable for tests; defaults to the real ingest endpoint. */
  send?: TelemetrySendFn;
  maxQueue?: number;
  flushThreshold?: number;
  flushIntervalMs?: number;
  now?: () => Date;
}

export interface AttemptTelemetry {
  readonly attemptId: number;
  track(
    type: ClientActivityEventType,
    metadata?: Record<string, unknown>
  ): void;
  /** Fire-and-forget drain of the queue (never rejects). */
  flush(): void;
  dispose(): void;
  getStats(): TelemetryStats;
}

class AttemptTelemetryImpl implements AttemptTelemetry {
  readonly attemptId: number;
  private readonly clientInstanceId?: string;
  private readonly send: TelemetrySendFn;
  private readonly maxQueue: number;
  private readonly flushThreshold: number;
  private readonly now: () => Date;
  private readonly timer: ReturnType<typeof setInterval> | null;
  private queue: ActivityEventInput[] = [];
  private nextSequence = 0;
  private flushing = false;
  /** Module-scope lifecycle flag — public so the singleton factory can check it. */
  disposed = false;
  private stats: TelemetryStats = {
    queued: 0,
    sent: 0,
    dropped: 0,
    failedBatches: 0,
  };

  constructor(attemptId: number, options: TelemetryOptions = {}) {
    this.attemptId = attemptId;
    this.clientInstanceId = options.clientInstanceId;
    this.send = options.send ?? ((id, events) => ingestActivityEvents(id, events));
    this.maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE;
    this.now = options.now ?? (() => new Date());
    this.flushThreshold = options.flushThreshold ?? DEFAULT_FLUSH_THRESHOLD;
    const intervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    // setInterval only exists in timers-capable environments; the emitter is
    // inert without one (server-side render never tracks events anyway).
    this.timer =
      typeof setInterval === "function"
        ? setInterval(() => this.flush(), intervalMs)
        : null;
  }

  track(
    type: ClientActivityEventType,
    metadata?: Record<string, unknown>
  ): void {
    if (this.disposed) return;
    if (!isClientActivityEventType(type)) return;
    const event: ActivityEventInput = {
      eventId: randomEventId(),
      eventType: type,
      clientOccurredAt: this.now().toISOString(),
      clientSequence: this.nextSequence++,
      ...(this.clientInstanceId ? { clientInstanceId: this.clientInstanceId } : {}),
      ...(sanitizeMetadata(metadata) ? { metadata: sanitizeMetadata(metadata) } : {}),
    };
    this.queue.push(event);
    if (this.queue.length > this.maxQueue) {
      // Drop-oldest: freshest events matter most for proctoring context.
      this.queue.splice(0, this.queue.length - this.maxQueue);
      this.stats.dropped += 1;
    }
    this.stats.queued = this.queue.length;
    if (this.queue.length >= this.flushThreshold) {
      this.flush();
    }
  }

  flush(): void {
    if (this.disposed || this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    void this.drain().finally(() => {
      this.flushing = false;
      this.stats.queued = this.queue.length;
    });
  }

  private async drain(): Promise<void> {
    while (!this.disposed && this.queue.length > 0) {
      const batch = this.queue.slice(0, MAX_BATCH_SIZE);
      let accepted = false;
      for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
        try {
          await this.send(this.attemptId, batch);
          accepted = true;
          break;
        } catch (err) {
          if (this.disposed) return;
          if (attempt < MAX_SEND_ATTEMPTS) {
            const delay = telemetryRetryDelayMs(err, attempt);
            const sleeper = Promise.withResolvers<void>();
            setTimeout(sleeper.resolve, delay);
            await sleeper.promise;
            if (this.disposed) return;
          }
        }
      }
      this.queue.splice(0, batch.length);
      if (accepted) {
        this.stats.sent += batch.length;
      } else {
        this.stats.dropped += batch.length;
        this.stats.failedBatches += 1;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer != null && typeof clearInterval === "function") {
      clearInterval(this.timer);
    }
    // Best-effort final drain — still fire-and-forget (never blocks unmount).
    if (this.queue.length > 0 && typeof setTimeout === "function") {
      const pending = this.queue;
      this.queue = [];
      void this.sendRemaining(pending);
    }
  }

  private async sendRemaining(events: ActivityEventInput[]): Promise<void> {
    for (let i = 0; i < events.length; i += MAX_BATCH_SIZE) {
      try {
        await this.send(this.attemptId, events.slice(i, i + MAX_BATCH_SIZE));
      } catch {
        // Page is navigating away — nothing more we can do honestly.
        this.stats.dropped += Math.min(MAX_BATCH_SIZE, events.length - i);
        this.stats.failedBatches += 1;
        return;
      }
    }
    this.stats.sent += events.length;
  }

  getStats(): TelemetryStats {
    return { ...this.stats, queued: this.queue.length };
  }
}

// ============================================================
// Module-scope singleton + PAGE_RELOADED visit marker
// ============================================================

let activeInstance: AttemptTelemetryImpl | null = null;

/**
 * Get (or create) the telemetry emitter for an attempt. Calling this again
 * with the SAME attemptId returns the live instance — re-renders never
 * duplicate emitters. A different attemptId disposes the previous instance
 * first (only one attempt is ever active in this tab).
 */
export function createAttemptTelemetry(
  attemptId: number,
  options: TelemetryOptions = {}
): AttemptTelemetry {
  if (
    activeInstance &&
    !activeInstance.disposed &&
    activeInstance.attemptId === attemptId
  ) {
    return activeInstance;
  }
  if (activeInstance && !activeInstance.disposed) {
    activeInstance.dispose();
  }
  activeInstance = new AttemptTelemetryImpl(attemptId, options);
  return activeInstance;
}

/** Test hook: dispose the singleton and forget the visit markers. */
export function resetAttemptTelemetry(): void {
  if (activeInstance && !activeInstance.disposed) {
    activeInstance.dispose();
  }
  activeInstance = null;
  visitedKeysThisSession.clear();
}

/**
 * Visit marker for PAGE_RELOADED detection. sessionStorage survives reloads
 * but this module-level set does not, so:
 *   - fresh page load with a stored flag → true (the student reloaded);
 *   - SPA remount with a stored flag (same JS session) → false.
 */
const visitedKeysThisSession = new Set<string>();

export function attemptVisitKey(attemptId: number): string {
  return `quizopia.attempt.${attemptId}.visited`;
}

/** Records a visit; returns true when a PREVIOUS load had left the marker. */
export function markAttemptVisited(attemptId: number): boolean {
  const key = attemptVisitKey(attemptId);
  let previouslyVisited = false;
  try {
    previouslyVisited =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(key) === "1";
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, "1");
    }
  } catch {
    // Storage unavailable (private mode / SSR) — marker degrades to no-op.
  }
  if (visitedKeysThisSession.has(key)) return false;
  visitedKeysThisSession.add(key);
  return previouslyVisited;
}
