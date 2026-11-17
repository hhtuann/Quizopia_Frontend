/**
 * Shared date/time formatting (P4-E). Extraction of the exact pattern the
 * monitoring surfaces already used locally (LiveMonitor, AiAlertFeed,
 * EvidenceSection, RecordingsCard, AttemptTimeline, session page) — new
 * components import from here; NO mass refactor of the existing copies.
 *
 * Honesty guard: invalid/absent instants render as "—", never "Invalid Date".
 */

/** `HH:mm:ss` (en-GB, 24h). Invalid input → "—". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** `17 Nov 2026, 08:15` (en-GB). Invalid/absent input → "—". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
