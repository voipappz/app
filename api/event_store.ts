// Local append-only event store. va-crystal owns event production and Cable/NATS
// owns delivery; this module only persists the canonical event received by the
// ActionCable consumer. Only local Dashboard projections read this table;
// Calls/Reports remain mothership-backed so their business logic is not copied.
import { DuckDBInstance } from "@duckdb/node-api";
import type { Normalized } from "./cable.ts";

export interface StoredEvent {
  event_id: string;
  call_id: string | null;
  event_type: string;
  action: string;
  occurred_at: string;
  occurred_at_epoch: number | null;
  payload: Record<string, unknown>;
  raw_payload: Record<string, unknown> | null;
}

export interface EventStoreStats {
  status: "up" | "down";
  path: string;
  retention_days: number;
  events: number;
  last_received_at: string | null;
  last_error?: string;
}

export interface DashboardCall {
  id: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number;
}

export interface DashboardSnapshot {
  stats: {
    total: number;
    answered: number;
    failed: number;
    inbound: number;
    outbound: number;
    avg_duration_sec: number;
  };
  calls_per_hour: Array<{ bucket: string; inbound: number; outbound: number; total: number }>;
  recent_calls: DashboardCall[];
}

// User-defined dashboard widget DEFINITION (the builder's output). Values are
// always computed from the local event projection — the definition only says
// what to show. Stored as a JSON row so the shape can grow without migrations.
export interface WidgetDefinition {
  uuid: string;
  title: string;
  type: string;                       // 'counter' (v1)
  metric: string;                     // key into DashboardSnapshot.stats
  position: number;
  [key: string]: unknown;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function stableEventId(event: Normalized): Promise<string> {
  const source = JSON.stringify(event.raw ?? { type: event.wsType, payload: event.wsPayload });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class EventStore {
  private instance: DuckDBInstance | null = null;
  private connection: any = null;
  private openPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly path: string;
  private readonly retentionDays: number;
  private writesSincePrune = 0;
  private lastError: string | null = null;

  constructor(
    path = Deno.env.get("EVENT_STORE_PATH") || "./data/events.duckdb",
    retentionDays = Number(Deno.env.get("EVENT_RETENTION_DAYS") || "7"),
  ) {
    this.path = path;
    this.retentionDays = Number.isFinite(retentionDays)
      ? Math.max(1, Math.min(365, Math.floor(retentionDays)))
      : 7;
  }

  async open(): Promise<void> {
    if (this.connection) return;
    if (this.openPromise) return this.openPromise;
    this.openPromise = this.initialize();
    try {
      await this.openPromise;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.openPromise = null;
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    const parent = this.path.substring(0, this.path.lastIndexOf("/"));
    if (parent) await Deno.mkdir(parent, { recursive: true });
    this.instance = await DuckDBInstance.create(this.path);
    this.connection = await this.instance.connect();
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS events (
        event_id VARCHAR PRIMARY KEY,
        call_id VARCHAR,
        event_type VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        occurred_at TIMESTAMP,
        occurred_at_epoch BIGINT,
        payload JSON NOT NULL,
        raw_payload JSON,
        received_at TIMESTAMP DEFAULT current_timestamp
      )
    `);
    await this.connection.run("CREATE INDEX IF NOT EXISTS events_call_id ON events(call_id)");
    await this.connection.run("CREATE INDEX IF NOT EXISTS events_occurred_at ON events(occurred_at)");
    await this.connection.run("CREATE INDEX IF NOT EXISTS events_action ON events(action)");
    // Dashboard widget definitions (the builder). Same local DB file — the
    // dashboard is entirely a local-projection feature.
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        uuid VARCHAR PRIMARY KEY,
        definition JSON NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `);
    await this.pruneUnlocked();
    this.lastError = null;
  }

  async listWidgets(): Promise<WidgetDefinition[]> {
    await this.open();
    await this.writeQueue;
    const result = await this.connection.runAndReadAll(
      "SELECT uuid, definition, position FROM dashboard_widgets ORDER BY position, uuid",
    );
    return result.getRowObjects().map((row: Record<string, unknown>) => ({
      ...(jsonObject(row.definition) ?? {}),
      uuid: String(row.uuid),
      position: Number(row.position ?? 0),
    })) as WidgetDefinition[];
  }

  /** Insert or replace one widget definition (uuid comes from the caller). */
  async saveWidget(widget: WidgetDefinition): Promise<WidgetDefinition> {
    await this.open();
    const { uuid, position, ...definition } = widget;
    const stored = { ...definition, title: definition.title || "", type: definition.type || "counter", metric: definition.metric || "total" };
    await this.connection.run(`
      INSERT OR REPLACE INTO dashboard_widgets (uuid, definition, position, updated_at)
      VALUES (${sqlString(uuid)}, CAST(${sqlString(JSON.stringify(stored))} AS JSON),
        ${Number.isFinite(position) ? Math.floor(position) : 0}, current_timestamp)
    `);
    return { ...stored, uuid, position: Number.isFinite(position) ? Math.floor(position) : 0 } as WidgetDefinition;
  }

  async deleteWidget(uuid: string): Promise<boolean> {
    await this.open();
    const before = await this.connection.runAndReadAll(
      `SELECT COUNT(*) AS count FROM dashboard_widgets WHERE uuid = ${sqlString(uuid)}`,
    );
    const exists = Number(before.getRowObjects()?.[0]?.count ?? 0) > 0;
    if (exists) await this.connection.run(`DELETE FROM dashboard_widgets WHERE uuid = ${sqlString(uuid)}`);
    return exists;
  }

  async ingest(event: Normalized): Promise<{ eventId: string; inserted: boolean }> {
    const operation = this.writeQueue.then(() => this.ingestUnlocked(event)).catch((error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    });
    // Keep the queue usable after an individual write failure while returning
    // the original rejection to that event's caller.
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async ingestUnlocked(event: Normalized): Promise<{ eventId: string; inserted: boolean }> {
    await this.open();
    const eventId = await stableEventId(event);
    const payload = JSON.stringify(event.wsPayload);
    const raw = event.raw ? JSON.stringify(event.raw) : "";
    const epoch = event.occurredAtIso ? Date.parse(event.occurredAtIso) : NaN;
    const occurred = Number.isFinite(epoch) ? new Date(epoch).toISOString() : "";
    const before = await this.connection.runAndReadAll(`SELECT COUNT(*) AS count FROM events WHERE event_id = ${sqlString(eventId)}`);
    const alreadyPresent = Number(before.getRowObjects()?.[0]?.count ?? 0) > 0;
    if (alreadyPresent) return { eventId, inserted: false };
    const sql = `
      INSERT INTO events (event_id, call_id, event_type, action, occurred_at, occurred_at_epoch, payload, raw_payload)
      SELECT ${sqlString(eventId)}, ${event.wsPayload.call_id ? sqlString(String(event.wsPayload.call_id)) : "NULL"},
        ${sqlString(event.wsType)}, ${sqlString(String(event.raw?.action ?? event.wsPayload.action ?? event.wsType))},
        ${occurred ? `CAST(${sqlString(occurred)} AS TIMESTAMP)` : "NULL"},
        ${Number.isFinite(epoch) ? String(Math.floor(epoch / 1000)) : "NULL"},
        CAST(${sqlString(payload)} AS JSON), ${raw ? `CAST(${sqlString(raw)} AS JSON)` : "NULL"}
      WHERE NOT EXISTS (SELECT 1 FROM events WHERE event_id = ${sqlString(eventId)})
    `;
    await this.connection.run(sql);
    this.lastError = null;
    if (++this.writesSincePrune >= 1000) await this.pruneUnlocked();
    return { eventId, inserted: true };
  }

  private async pruneUnlocked(): Promise<void> {
    await this.connection.run(`
      DELETE FROM events
      WHERE received_at < current_timestamp - INTERVAL '${this.retentionDays} days'
    `);
    this.writesSincePrune = 0;
  }

  async stats(): Promise<EventStoreStats> {
    try {
      await this.open();
      await this.writeQueue;
      const result = await this.connection.runAndReadAll(`
        SELECT COUNT(*) AS events, CAST(MAX(received_at) AS VARCHAR) AS last_received_at
        FROM events
      `);
      const row = result.getRowObjects()?.[0] ?? {};
      return {
        status: this.lastError ? "down" : "up",
        path: this.path,
        retention_days: this.retentionDays,
        events: Number(row.events ?? 0),
        last_received_at: row.last_received_at == null ? null : String(row.last_received_at),
        ...(this.lastError ? { last_error: this.lastError } : {}),
      };
    } catch (error) {
      return {
        status: "down",
        path: this.path,
        retention_days: this.retentionDays,
        events: 0,
        last_received_at: null,
        last_error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async list(limit = 100, offset = 0): Promise<StoredEvent[]> {
    await this.open();
    await this.writeQueue;
    const result = await this.connection.runAndReadAll(`
      SELECT event_id, call_id, event_type, action, CAST(occurred_at AS VARCHAR) AS occurred_at,
        occurred_at_epoch, payload, raw_payload
      FROM events ORDER BY occurred_at_epoch DESC NULLS LAST, received_at DESC
      LIMIT ${Math.max(1, Math.min(1000, Math.floor(limit)))} OFFSET ${Math.max(0, Math.floor(offset))}
    `);
    return result.getRowObjects().map((row: Record<string, unknown>) => ({
      event_id: String(row.event_id),
      call_id: row.call_id == null ? null : String(row.call_id),
      event_type: String(row.event_type),
      action: String(row.action),
      occurred_at: row.occurred_at == null ? "" : String(row.occurred_at),
      occurred_at_epoch: row.occurred_at_epoch == null ? null : Number(row.occurred_at_epoch),
      payload: jsonObject(row.payload) ?? {},
      raw_payload: jsonObject(row.raw_payload),
    }));
  }

  async dashboardSnapshot(fromEpoch: number, toEpoch: number, recentLimit = 6): Promise<DashboardSnapshot> {
    await this.open();
    await this.writeQueue;
    const from = Math.max(0, Math.floor(fromEpoch));
    const to = Math.max(from, Math.floor(toEpoch));
    const limit = Math.max(1, Math.min(50, Math.floor(recentLimit)));
    const callsCte = `
      WITH call_events AS (
        SELECT call_id, event_type, occurred_at_epoch,
          json_extract_string(payload, '$.direction') AS direction,
          json_extract_string(payload, '$.from') AS from_number,
          json_extract_string(payload, '$.to') AS to_number
        FROM events
        WHERE call_id IS NOT NULL AND event_type LIKE 'call.%'
      ), calls AS (
        SELECT call_id,
          MIN(occurred_at_epoch) AS started_epoch,
          MIN(occurred_at_epoch) FILTER (WHERE event_type = 'call.answered') AS answered_epoch,
          MAX(occurred_at_epoch) FILTER (WHERE event_type = 'call.completed') AS ended_epoch,
          arg_max(direction, occurred_at_epoch) FILTER (WHERE direction IS NOT NULL) AS direction,
          arg_max(from_number, occurred_at_epoch) FILTER (WHERE from_number IS NOT NULL) AS from_number,
          arg_max(to_number, occurred_at_epoch) FILTER (WHERE to_number IS NOT NULL) AS to_number
        FROM call_events GROUP BY call_id
      ), windowed AS (
        SELECT * FROM calls WHERE started_epoch BETWEEN ${from} AND ${to}
      )
    `;
    const statsResult = await this.connection.runAndReadAll(`${callsCte}
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE answered_epoch IS NOT NULL) AS answered,
        COUNT(*) FILTER (WHERE ended_epoch IS NOT NULL AND answered_epoch IS NULL) AS failed,
        COUNT(*) FILTER (WHERE lower(direction) IN ('inbound', 'incoming')) AS inbound,
        COUNT(*) FILTER (WHERE lower(direction) IN ('outbound', 'outgoing')) AS outbound,
        COALESCE(AVG(GREATEST(0, ended_epoch - answered_epoch)) FILTER
          (WHERE ended_epoch IS NOT NULL AND answered_epoch IS NOT NULL), 0) AS avg_duration_sec
      FROM windowed
    `);
    const s = statsResult.getRowObjects()?.[0] ?? {};
    const hourlyResult = await this.connection.runAndReadAll(`${callsCte}
      SELECT strftime(to_timestamp(FLOOR(started_epoch / 3600) * 3600), '%Y-%m-%dT%H:00:00Z') AS bucket,
        COUNT(*) FILTER (WHERE lower(direction) IN ('inbound', 'incoming')) AS inbound,
        COUNT(*) FILTER (WHERE lower(direction) IN ('outbound', 'outgoing')) AS outbound,
        COUNT(*) AS total
      FROM windowed GROUP BY 1 ORDER BY 1
    `);
    const recentResult = await this.connection.runAndReadAll(`${callsCte}
      SELECT call_id, direction, from_number, to_number, started_epoch, answered_epoch, ended_epoch
      FROM windowed ORDER BY started_epoch DESC LIMIT ${limit}
    `);
    const iso = (value: unknown): string | null => value == null ? null : new Date(Number(value) * 1000).toISOString();
    return {
      stats: {
        total: Number(s.total ?? 0),
        answered: Number(s.answered ?? 0),
        failed: Number(s.failed ?? 0),
        inbound: Number(s.inbound ?? 0),
        outbound: Number(s.outbound ?? 0),
        avg_duration_sec: Math.round(Number(s.avg_duration_sec ?? 0)),
      },
      calls_per_hour: hourlyResult.getRowObjects().map((row: Record<string, unknown>) => ({
        bucket: String(row.bucket), inbound: Number(row.inbound ?? 0),
        outbound: Number(row.outbound ?? 0), total: Number(row.total ?? 0),
      })),
      recent_calls: recentResult.getRowObjects().map((row: Record<string, unknown>) => {
        const answeredAt = iso(row.answered_epoch);
        const endedAt = iso(row.ended_epoch);
        return {
          id: String(row.call_id),
          direction: String(row.direction ?? "unknown"),
          from_number: row.from_number == null ? null : String(row.from_number),
          to_number: row.to_number == null ? null : String(row.to_number),
          status: endedAt ? (answeredAt ? "completed" : "failed") : (answeredAt ? "answered" : "ringing"),
          started_at: iso(row.started_epoch) ?? "",
          answered_at: answeredAt,
          ended_at: endedAt,
          duration_sec: answeredAt && endedAt
            ? Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(answeredAt)) / 1000)) : 0,
        };
      }),
    };
  }

  async close(): Promise<void> {
    await this.writeQueue;
    this.connection?.close?.();
    this.connection = null;
    this.instance = null;
    this.openPromise = null;
  }
}
