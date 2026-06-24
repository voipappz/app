// Event-freshness check — `cable_ready` only means "subscribed", not "events are
// flowing". This derives a stream-freshness verdict from the last time a cable
// event was seen, so a silent broker/CDR feed surfaces as `stale` instead of
// green. Pure (deps passed in) so it's deterministic and unit-testable.
export type FreshnessStatus = "up" | "stale" | "idle" | "disabled";

export interface Freshness {
  status: FreshnessStatus;
  detail?: string;
  last_event_at: string | null; // ISO, or null if never / disabled
  age_seconds: number | null;   // seconds since last event, or null
}

// lastAtMs / nowMs are epoch ms. thresholdSec = 0 disables the stale verdict
// (still reports last_event_at + age). cableEnabled false → disabled.
export function eventFreshness(
  lastAtMs: number | null,
  nowMs: number,
  thresholdSec: number,
  cableEnabled: boolean,
): Freshness {
  if (!cableEnabled) {
    return { status: "disabled", detail: "cable tap off (no token)", last_event_at: null, age_seconds: null };
  }
  if (lastAtMs == null) {
    return { status: "idle", detail: "no events since boot", last_event_at: null, age_seconds: null };
  }
  const age = Math.max(0, Math.round((nowMs - lastAtMs) / 1000));
  const last_event_at = new Date(lastAtMs).toISOString();
  if (thresholdSec > 0 && age > thresholdSec) {
    return { status: "stale", detail: `no events for ${age}s (threshold ${thresholdSec}s)`, last_event_at, age_seconds: age };
  }
  return { status: "up", last_event_at, age_seconds: age };
}
