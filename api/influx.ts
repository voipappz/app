// InfluxDB 3 client (server-side) — the dashboard's aggregated call-metrics
// source, taking over the role the removed DuckDB projections had.
//
// InfluxDB 3 (monitoring.voipappz.com, port 8181 / 443) is queried with SQL over
// its HTTP query API: POST {url}/api/v3/query_sql  { db, q, format:"json" } with
// an `Authorization: Bearer <apiv3 token>`. We keep the SQL builders and the
// row-shapers PURE (no network) so they unit-test without a live InfluxDB; only
// `runInfluxSql` touches the wire.
//
// Schema reference (voipappz-api InfluxDB::CdrMetrics — the BI source of truth):
//   measurement `cdr`
//   tags   : environment_uuid, direction, disposition, type, hangup_disposition
//   fields : duration, talk_duration, call_uuid, leg_a_type, leg_b_type, …
//   calls-per-hour = count(duration) grouped by direction + hour, leg_a_type<>'call'.
import { INFLUX_URL, INFLUX_TOKEN, INFLUX_DATABASE, INFLUX_ENABLED } from "./config.ts";

export interface InfluxRow {
  [col: string]: string | number | null;
}

export interface CallsPerHourPoint {
  bucket: string;            // ISO hour
  inbound: number;
  outbound: number;
  total: number;
}

// ── SQL escaping ────────────────────────────────────────────────────────────
// We only ever interpolate UUIDs (validated) and integers, but escape single
// quotes defensively. environment_uuids are validated against a UUID shape so a
// malformed value can never reach the query.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function sqlUuidList(uuids: string[]): string {
  return uuids
    .filter((u) => UUID_RE.test(u))
    .map((u) => `'${u}'`)
    .join(", ");
}

// ── Pure SQL builders ───────────────────────────────────────────────────────
/**
 * Calls bucketed per hour and split by direction, over the last `minutes`.
 * Mirrors CdrMetrics.report_calls_by_direction (count(duration) grouped by
 * direction + hour, excluding leg_a_type='call'). InfluxDB 3 DataFusion SQL.
 */
export function callsPerHourSql(opts: { minutes?: number; environmentUuids?: string[] } = {}): string {
  const minutes = Number.isFinite(opts.minutes) && (opts.minutes as number) > 0 ? Math.floor(opts.minutes as number) : 1440;
  const envs = opts.environmentUuids?.length ? sqlUuidList(opts.environmentUuids) : "";
  const envClause = envs ? ` AND "environment_uuid" IN (${envs})` : "";
  return (
    `SELECT date_bin(INTERVAL '1 hour', "time") AS bucket, "direction", count("duration") AS calls ` +
    `FROM "cdr" ` +
    `WHERE "time" >= now() - INTERVAL '${minutes} minutes' ` +
    `AND "leg_a_type" <> 'call'${envClause} ` +
    `GROUP BY bucket, "direction" ` +
    `ORDER BY bucket`
  );
}

// ── Pure row-shaper ─────────────────────────────────────────────────────────
/** Collapse InfluxDB's (bucket, direction, calls) rows into per-hour points. */
export function toCallsPerHour(rows: InfluxRow[]): CallsPerHourPoint[] {
  const byBucket = new Map<string, CallsPerHourPoint>();
  for (const r of rows ?? []) {
    const bucket = String(r.bucket ?? r.time ?? "");
    if (!bucket) continue;
    // The real `cdr` measurement tags direction as incoming/outgoing (verified
    // live); accept inbound/outbound too so the shaper is vocabulary-agnostic.
    const dir = String(r.direction ?? "").toLowerCase();
    const n = Number(r.calls ?? 0) || 0;
    const p = byBucket.get(bucket) ?? { bucket, inbound: 0, outbound: 0, total: 0 };
    if (dir === "incoming" || dir === "inbound" || dir === "in") p.inbound += n;
    else if (dir === "outgoing" || dir === "outbound" || dir === "out") p.outbound += n;
    p.total += n;
    byBucket.set(bucket, p);
  }
  return [...byBucket.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));
}

// ── Wire executor (the only impure part) ────────────────────────────────────
/**
 * Run a read-only SQL query against InfluxDB 3. Returns the row array.
 * `fetchImpl` is injectable for tests. Throws on transport/HTTP error so the
 * caller can degrade the dashboard rather than render wrong numbers.
 */
export async function runInfluxSql(
  sql: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<InfluxRow[]> {
  if (!INFLUX_ENABLED) throw new Error("InfluxDB not configured (INFLUXDB_TOKEN unset)");
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${INFLUX_URL}/api/v3/query_sql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${INFLUX_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ db: INFLUX_DATABASE, q: sql, format: "json" }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`InfluxDB query failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  // InfluxDB 3 query_sql (format:json) returns an array of row objects.
  return Array.isArray(data) ? data as InfluxRow[] : (data?.rows ?? []);
}

// ── High-level dashboard query ──────────────────────────────────────────────
export async function dashboardCallsPerHour(
  opts: { minutes?: number; environmentUuids?: string[]; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<CallsPerHourPoint[]> {
  const rows = await runInfluxSql(callsPerHourSql(opts), { signal: opts.signal, fetchImpl: opts.fetchImpl });
  return toCallsPerHour(rows);
}
