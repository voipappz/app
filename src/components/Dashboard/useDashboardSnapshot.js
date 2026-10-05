import { useEffect, useState, useCallback, useRef } from 'react';
import { monitoringApi } from '../../services/api/monitoringApi';
import { hasMeasurement } from '../../services/api/influxSchema';

/**
 * Dashboard's data plane. Unlike app's original REST `/dashboard/snapshot`
 * (a single bespoke endpoint), this composes two ALREADY-EXISTING,
 * already-scoped sources — the same split this codebase already uses
 * elsewhere (Influx for live/aggregate panels, Postgres for row-level lists):
 *
 *  - `calls_per_hour` + the `total`/`inbound`/`outbound` stats come from
 *    `monitoringApi.getLiveCallsChart()`, which runs EventState.chart_pair
 *    against InfluxDB and enforces environment/customer scoping server-side
 *    (see monitoringApi.js's own header comment).
 *  - `recent_calls` reads the `cdr` measurement through /influxdb/rows, so
 *    the whole screen sits on InfluxDB and nothing else. That endpoint only
 *    exists on API builds carrying voipappz-api ddaa69d05; on older ones the
 *    list reads empty rather than falling back to Postgres, which is the
 *    point — one data path, one story about where the numbers come from.
 *
 * `answered`/`failed`/`avg_duration_sec` are deliberately NOT populated yet —
 * no existing, verified-scoped endpoint exposes them today (queue_identity's
 * per-status counters are of unconfirmed cumulative-vs-delta semantics, and
 * guessing would put wrong numbers on a KPI tile). Follow-up if wanted.
 */

const EMPTY_STATS = { total: 0, inbound: 0, outbound: 0 };
const EMPTY = { stats: EMPTY_STATS, calls_per_hour: [], recent_calls: [] };

// Backend row `name` is a timestamp string (InfluxDB `t`, e.g. "2026-01-01T14:00:00Z").
function fmtHour(name) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(name)) ? name : `${name}Z`);
  return Number.isNaN(d.getTime())
    ? { ts: String(name), hour: String(name) }
    // HH:MM, not HH:00 — buckets are 5 minutes now, and an hour-truncated
    // label would stack all twelve of them on one x position.
    : { ts: d.getTime(), hour: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

function buildCallsPerHour(chartPair) {
  const incoming = chartPair.find((s) => s.name === 'incoming')?.series || [];
  const outgoing = chartPair.find((s) => s.name === 'outgoing')?.series || [];
  const byTime = new Map();
  const upsert = (point, key) => {
    const { ts, hour } = fmtHour(point.name);
    const entry = byTime.get(ts) || { ts, hour, inbound: 0, outbound: 0 };
    entry[key] = point.value || 0;
    byTime.set(ts, entry);
  };
  incoming.forEach((p) => upsert(p, 'inbound'));
  outgoing.forEach((p) => upsert(p, 'outbound'));
  return [...byTime.values()]
    .sort((a, b) => (typeof a.ts === 'number' && typeof b.ts === 'number' ? a.ts - b.ts : String(a.ts).localeCompare(String(b.ts))))
    .map(({ ts: _ts, ...point }) => ({ ...point, total: point.inbound + point.outbound }));
}

// A duration as seconds, whether the API sent a number, a numeric string or
// "HH:MM:SS" / "MM:SS".
function toSeconds(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value);
  if (!text.includes(':')) return Number(text) || 0;
  return text.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);
}

// GET /api/calls rows carry the call's facts under `profile` (caller, callee,
// direction, talk_duration, cause) for an account and a user token alike —
// Serializers::Call :list / :portal_list. Reading them only from the top level
// left every row of the phone's recent calls blank. The top-level names are
// kept as fallbacks for the flat shapes other endpoints return.
export function mapRecentCall(row, index) {
  const profile = row.profile || {};
  return {
    id: row.uuid || row.id || row.call_uuid || String(index),
    direction: profile.direction || row.direction || '',
    from_number: profile.caller || row.caller || row.from_number || row.caller_id_number || null,
    to_number: profile.callee || row.callee || row.to_number || row.destination_number || null,
    status: profile.disposition || profile.cause || row.disposition || row.status || row.hangup_disposition || '',
    started_at: row.created_at || row.started_at || '',
    duration_sec: toSeconds(profile.talk_duration ?? profile.billsec_duration
      ?? row.billsec_duration ?? row.duration_sec ?? row.duration),
    // Same fallback chain the admin grid uses (see
    // Calls/ColumnHandlers/useColumnHandlers.jsx) — the recording lands under
    // different keys depending on the row's shape.
    recording_url: row.recording?.url || row.profile?.recordingUrl || row.profile?.recording_url
      || row.recordingUrl || row.recording_url || null,
    // Keep the complete Calls API row for the shared side detail panel. The
    // compact phone list only renders a few fields, but opening a row must
    // retain its recording, transcript and call metadata.
    call: row,
  };
}

// The same shape, from an InfluxDB `cdr` point. cdr names its columns
// differently from the calls API (caller/callee, talk_duration, disposition
// as a tag), and carries no uuid — so key off the call id it does have.
export function mapCdrCall(row, index) {
  return {
    raw: row,
    id: row.call_uuid || row.sip_call_id || `${row.time}-${index}`,
    direction: row.direction || '',
    from_number: row.caller || null,
    to_number: row.callee || null,
    status: row.disposition || row.cause || row.state || '',
    started_at: row.time || '',
    duration_sec: Number(row.talk_duration ?? row.duration ?? 0),
    recording_url: row.recording_url || null
  };
}

/**
 * @param {Object} scope
 * @param {string} [scope.environmentUuid] - precise scope (preferred)
 * @param {string} [scope.customerUuid] - fallback scope (admin, no single environment selected)
 * @param {number} [scope.minutes=1440] - rolling window, minutes (default 24h)
 * @param {string} [scope.bucket='1h'] - InfluxDB bucket size
 */
// 60 minutes at 5-minute buckets, NOT 24 hours at 1-hour buckets.
//
// /monitoring/charts aggregates live_state with MEAN (EventState.chart_pair ->
// LiveState.mean_by_environment). A call that is live for one minute inside a
// 1-hour bucket means 1/60 ~= 0.017, which collapses to zero and the bucket is
// dropped; inside a 5-minute bucket the same call means 0.2 and survives.
//
// Measured against a live environment carrying real traffic:
//   minutes=60   bucket=5m  -> 4 points, sum 5   (current)
//   minutes=180  bucket=15m -> 2 points, sum 2
//   minutes=1440 bucket=1h  -> 1 point,  sum 1   (looks empty)
//
// The counts falling as the window widens is the giveaway. A 24-hour view of
// this measurement cannot be made accurate by asking more politely — mean over
// a coarse bucket is the wrong question for a gauge sampled once a minute. So
// ask the question the data can answer, and label the screen honestly.
const DEFAULT_MINUTES = 60;
const DEFAULT_BUCKET = '5m';

export function useDashboardSnapshot({
  environmentUuid, customerUuid, minutes = DEFAULT_MINUTES, bucket = DEFAULT_BUCKET
} = {}) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [status, setStatus] = useState('loading');
  const aliveRef = useRef(true);

  // Both sources are Influx, but they fail INDEPENDENTLY — /charts and
  // /influxdb/rows are separate endpoints over separate measurements, and
  // /influxdb/rows is missing entirely on older API builds. Awaiting them
  // together meant one failure blanked the other's perfectly good data and
  // flipped the whole screen to "Offline".
  const load = useCallback(async () => {
    const [chartResult, callsResult] = await Promise.allSettled([
      monitoringApi.getLiveCallsChart(environmentUuid, minutes, bucket, customerUuid),
      // Only ask for cdr rows if this deployment's InfluxDB actually has the
      // measurement — otherwise /influxdb/rows 404s and the recent-calls list
      // is empty either way, minus a failed request.
      hasMeasurement('cdr').then((present) =>
        present ? monitoringApi.getInfluxRows({ measurement: 'cdr', minutes: 1440, limit: 10 }) : { rows: [] })
    ]);

    if (!aliveRef.current) return;

    const chartOk = chartResult.status === 'fulfilled';
    const callsOk = callsResult.status === 'fulfilled';
    if (!chartOk) console.warn('[useDashboardSnapshot] calls chart unavailable:', chartResult.reason?.message);
    if (!callsOk) console.warn('[useDashboardSnapshot] recent calls unavailable:', callsResult.reason?.message);

    const calls_per_hour = chartOk ? buildCallsPerHour(Array.isArray(chartResult.value) ? chartResult.value : []) : [];
    const totals = calls_per_hour.reduce(
      (acc, p) => ({ inbound: acc.inbound + p.inbound, outbound: acc.outbound + p.outbound }),
      { inbound: 0, outbound: 0 }
    );

    const callsValue = callsOk ? callsResult.value : null;
    const recentRows = Array.isArray(callsValue?.rows) ? callsValue.rows : [];

    setSnapshot({
      stats: { total: totals.inbound + totals.outbound, inbound: totals.inbound, outbound: totals.outbound },
      calls_per_hour,
      recent_calls: recentRows.map(mapCdrCall)
    });
    // Offline only when NOTHING came back. Partial data is still live data.
    setStatus(chartOk || callsOk ? 'live' : 'error');
  }, [environmentUuid, customerUuid, minutes, bucket]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const timer = setInterval(load, 30_000);
    return () => { aliveRef.current = false; clearInterval(timer); };
  }, [load]);

  return { snapshot, status };
}

export default useDashboardSnapshot;
