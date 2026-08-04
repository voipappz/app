// Bucket calls into hourly counts.
//
// This used to come from InfluxDB (date_bin, server-side) through deno's
// /dashboard/calls-per-hour. That endpoint answers 503 whenever INFLUXDB_URL is
// unset — which it is — so the chart was permanently empty. The mothership is
// the source of truth for calls and this app already reads it for the Calls
// page, so the series is derived from the same data instead of a second store
// that has to be provisioned separately.

/** An hour key ("2026-08-05T14:00:00Z") for a timestamp. */
export function hourBucket(value) {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const utc = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours()));
  return utc.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * `calls` → `[{ bucket, inbound, outbound, total }]`, one entry per hour in the
 * window, ascending. Empty hours are included with zeros: a chart with holes in
 * it reads as missing data rather than as a quiet hour.
 */
export function bucketCallsPerHour(calls, { from, to } = {}) {
  const end = to instanceof Date ? to : new Date(to ?? Date.now());
  const start = from instanceof Date ? from : new Date(from ?? end.getTime() - 24 * 3600 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const counts = new Map();
  for (let t = hourBucket(start); t && t <= hourBucket(end);) {
    counts.set(t, { bucket: t, inbound: 0, outbound: 0, total: 0 });
    const next = new Date(t);
    next.setUTCHours(next.getUTCHours() + 1);
    t = hourBucket(next);
  }

  for (const call of Array.isArray(calls) ? calls : []) {
    const key = hourBucket(call?.startedAt);
    // A call outside the window is not an error — the API pages by recency, so
    // an over-fetch can bring in older rows. Drop them rather than widen the
    // axis under the reader's feet.
    const slot = key && counts.get(key);
    if (!slot) continue;
    if (call.direction === 'inbound') slot.inbound += 1;
    else if (call.direction === 'outbound') slot.outbound += 1;
    slot.total += 1;
  }

  return [...counts.values()];
}
