// Local append-only event store. va-crystal/API own event production and
// Cable/Core-NATS own delivery; this module persists both Deno's normalized
// projection and the untouched received object. The Dashboard and Raw events
// screen read this table; Calls/Reports remain mothership-backed.
import { DuckDBInstance } from "@duckdb/node-api";
import type { Normalized } from "./cable.ts";

export interface StoredEvent {
  event_id: string;
  call_id: string | null;
  event_type: string;
  action: string;
  occurred_at: string;
  occurred_at_epoch: number | null;
  received_at: string;
  payload: Record<string, unknown>;
  raw_payload: Record<string, unknown> | null;
}

export interface EventListQuery {
  limit?: number;
  offset?: number;
  q?: string;
  eventType?: string;
  action?: string;
  callId?: string;
}

export interface StoredEventPage {
  events: StoredEvent[];
  total: number;
}

export interface EventStoreStats {
  status: "up" | "down";
  path: string;
  retention: "forever";
  events: number;
  last_received_at: string | null;
  last_error?: string;
}

export interface EventSyncState {
  source: string;
  cursor_event_id: string | null;
  head_event_id: string | null;
  caught_up: boolean;
  last_reconciled_at: string | null;
  last_error: string | null;
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

export interface DashboardDefinition {
  uuid: string;
  name: string;
  position: number;
}

// User-defined dashboard widget DEFINITION (the builder's output). Values are
// always computed from the local event projection — the definition only says
// what to show. Stored as a JSON row so the shape can grow without migrations.
export interface WidgetDefinition {
  uuid: string;
  dashboard_uuid: string;
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

function eventWhere(query: EventListQuery): string {
  const conditions: string[] = [];
  if (query.eventType) conditions.push(`event_type = ${sqlString(query.eventType)}`);
  if (query.action) conditions.push(`action = ${sqlString(query.action)}`);
  if (query.callId) conditions.push(`call_id = ${sqlString(query.callId)}`);
  if (query.q) {
    const pattern = sqlString(`%${query.q}%`);
    conditions.push(`(
      event_id ILIKE ${pattern} OR COALESCE(call_id, '') ILIKE ${pattern}
      OR event_type ILIKE ${pattern} OR action ILIKE ${pattern}
      OR CAST(payload AS VARCHAR) ILIKE ${pattern}
      OR COALESCE(CAST(raw_payload AS VARCHAR), '') ILIKE ${pattern}
    )`);
  }
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

async function stableEventId(event: Normalized): Promise<string> {
  if (event.sourceEventId) return event.sourceEventId;
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
  private lastError: string | null = null;

  constructor(path = Deno.env.get("EVENT_STORE_PATH") || "./data/events.duckdb") {
    this.path = path;
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
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS event_sync_state (
        source VARCHAR PRIMARY KEY,
        cursor_event_id VARCHAR,
        head_event_id VARCHAR,
        caught_up BOOLEAN NOT NULL DEFAULT false,
        last_reconciled_at TIMESTAMP,
        last_error VARCHAR
      )
    `);
    // User-created dashboards + their widget definitions. Both live beside the
    // events they visualize, so this feature never depends on the mothership.
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS dashboard_definitions (
        uuid VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `);
    await this.connection.run(`
      INSERT INTO dashboard_definitions (uuid, name, position)
      SELECT 'default', 'Main dashboard', 0
      WHERE NOT EXISTS (SELECT 1 FROM dashboard_definitions WHERE uuid = 'default')
    `);
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        uuid VARCHAR PRIMARY KEY,
        definition JSON NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        dashboard_uuid VARCHAR NOT NULL DEFAULT 'default',
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `);
    // Existing installations predate multiple dashboards. DuckDB's guarded
    // ALTER keeps every old widget on the default dashboard without a rebuild.
    await this.connection.run(
      "ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS dashboard_uuid VARCHAR DEFAULT 'default'",
    );
    await this.connection.run(
      "UPDATE dashboard_widgets SET dashboard_uuid = 'default' WHERE dashboard_uuid IS NULL OR dashboard_uuid = ''",
    );
    await this.connection.run(
      "CREATE INDEX IF NOT EXISTS dashboard_widgets_dashboard ON dashboard_widgets(dashboard_uuid)",
    );
    this.lastError = null;
  }

  async listDashboards(): Promise<DashboardDefinition[]> {
    await this.open();
    await this.writeQueue;
    const result = await this.connection.runAndReadAll(
      "SELECT uuid, name, position FROM dashboard_definitions ORDER BY position, name, uuid",
    );
    return result.getRowObjects().map((row: Record<string, unknown>) => ({
      uuid: String(row.uuid),
      name: String(row.name),
      position: Number(row.position ?? 0),
    }));
  }

  async saveDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition> {
    await this.open();
    const position = Number.isFinite(dashboard.position) ? Math.floor(dashboard.position) : 0;
    const name = dashboard.name.trim() || "Untitled dashboard";
    await this.connection.run(`
      INSERT OR REPLACE INTO dashboard_definitions (uuid, name, position, updated_at)
      VALUES (${sqlString(dashboard.uuid)}, ${sqlString(name)}, ${position}, current_timestamp)
    `);
    return { uuid: dashboard.uuid, name, position };
  }

  /** The seeded default is permanent; user-created dashboards are removable. */
  async deleteDashboard(uuid: string): Promise<boolean> {
    await this.open();
    if (uuid === "default") return false;
    const before = await this.connection.runAndReadAll(
      `SELECT COUNT(*) AS count FROM dashboard_definitions WHERE uuid = ${sqlString(uuid)}`,
    );
    const exists = Number(before.getRowObjects()?.[0]?.count ?? 0) > 0;
    if (!exists) return false;
    await this.connection.run("BEGIN TRANSACTION");
    try {
      await this.connection.run(`DELETE FROM dashboard_widgets WHERE dashboard_uuid = ${sqlString(uuid)}`);
      await this.connection.run(`DELETE FROM dashboard_definitions WHERE uuid = ${sqlString(uuid)}`);
      await this.connection.run("COMMIT");
      return true;
    } catch (error) {
      try { await this.connection.run("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
  }

  async listWidgets(dashboardUuid = "default"): Promise<WidgetDefinition[]> {
    await this.open();
    await this.writeQueue;
    const result = await this.connection.runAndReadAll(
      `SELECT uuid, dashboard_uuid, definition, position FROM dashboard_widgets
       WHERE dashboard_uuid = ${sqlString(dashboardUuid)} ORDER BY position, uuid`,
    );
    return result.getRowObjects().map((row: Record<string, unknown>) => ({
      ...(jsonObject(row.definition) ?? {}),
      uuid: String(row.uuid),
      dashboard_uuid: String(row.dashboard_uuid ?? "default"),
      position: Number(row.position ?? 0),
    })) as WidgetDefinition[];
  }

  /** Insert or replace one widget definition (uuid comes from the caller). */
  async saveWidget(widget: WidgetDefinition): Promise<WidgetDefinition> {
    await this.open();
    const { uuid, dashboard_uuid = "default", position, ...definition } = widget;
    const stored = { ...definition, title: definition.title || "", type: definition.type || "counter", metric: definition.metric || "total" };
    await this.connection.run(`
      INSERT OR REPLACE INTO dashboard_widgets (uuid, definition, position, dashboard_uuid, updated_at)
      VALUES (${sqlString(uuid)}, CAST(${sqlString(JSON.stringify(stored))} AS JSON),
        ${Number.isFinite(position) ? Math.floor(position) : 0}, ${sqlString(dashboard_uuid)}, current_timestamp)
    `);
    return {
      ...stored, uuid, dashboard_uuid,
      position: Number.isFinite(position) ? Math.floor(position) : 0,
    } as WidgetDefinition;
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

  /** Persist an ordered replay page and its cursor in one DuckDB transaction. */
  async ingestReplayPage(
    events: Normalized[],
    state: { source: string; cursorEventId: string | null; headEventId: string | null; caughtUp: boolean },
  ): Promise<{ inserted: number; duplicates: number }> {
    const operation = this.writeQueue.then(async () => {
      await this.open();
      await this.connection.run("BEGIN TRANSACTION");
      let inserted = 0;
      try {
        for (const event of events) {
          const result = await this.ingestUnlocked(event);
          if (result.inserted) inserted++;
        }
        await this.connection.run(`
          INSERT OR REPLACE INTO event_sync_state
            (source, cursor_event_id, head_event_id, caught_up, last_reconciled_at, last_error)
          VALUES (${sqlString(state.source)},
            ${state.cursorEventId ? sqlString(state.cursorEventId) : "NULL"},
            ${state.headEventId ? sqlString(state.headEventId) : "NULL"},
            ${state.caughtUp ? "true" : "false"}, current_timestamp, NULL)
        `);
        await this.connection.run("COMMIT");
        this.lastError = null;
        return { inserted, duplicates: events.length - inserted };
      } catch (error) {
        try { await this.connection.run("ROLLBACK"); } catch { /* original error wins */ }
        throw error;
      }
    }).catch((error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async recordSyncError(source: string, error: string): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      await this.open();
      await this.connection.run(`
        INSERT INTO event_sync_state (source, caught_up, last_error)
        VALUES (${sqlString(source)}, false, ${sqlString(error)})
        ON CONFLICT (source) DO UPDATE SET caught_up = false, last_error = ${sqlString(error)}
      `);
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async syncState(source: string): Promise<EventSyncState | null> {
    await this.open();
    await this.writeQueue;
    const result = await this.connection.runAndReadAll(`
      SELECT source, cursor_event_id, head_event_id, caught_up,
        CAST(last_reconciled_at AS VARCHAR) AS last_reconciled_at, last_error
      FROM event_sync_state WHERE source = ${sqlString(source)}
    `);
    const row = result.getRowObjects()?.[0];
    if (!row) return null;
    return {
      source: String(row.source),
      cursor_event_id: row.cursor_event_id == null ? null : String(row.cursor_event_id),
      head_event_id: row.head_event_id == null ? null : String(row.head_event_id),
      caught_up: Boolean(row.caught_up),
      last_reconciled_at: row.last_reconciled_at == null ? null : String(row.last_reconciled_at),
      last_error: row.last_error == null ? null : String(row.last_error),
    };
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
    return { eventId, inserted: true };
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
        retention: "forever",
        events: Number(row.events ?? 0),
        last_received_at: row.last_received_at == null ? null : String(row.last_received_at),
        ...(this.lastError ? { last_error: this.lastError } : {}),
      };
    } catch (error) {
      return {
        status: "down",
        path: this.path,
        retention: "forever",
        events: 0,
        last_received_at: null,
        last_error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async list(limit = 100, offset = 0): Promise<StoredEvent[]> {
    return (await this.page({ limit, offset })).events;
  }

  /** Read a filtered page directly from DuckDB without altering raw payloads. */
  async page(query: EventListQuery = {}): Promise<StoredEventPage> {
    await this.open();
    await this.writeQueue;
    const limit = Math.max(1, Math.min(1000, Math.floor(query.limit ?? 100)));
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const where = eventWhere(query);
    const countResult = await this.connection.runAndReadAll(`SELECT COUNT(*) AS total FROM events ${where}`);
    const result = await this.connection.runAndReadAll(`
      SELECT event_id, call_id, event_type, action, CAST(occurred_at AS VARCHAR) AS occurred_at,
        occurred_at_epoch, CAST(received_at AS VARCHAR) AS received_at, payload, raw_payload
      FROM events ${where} ORDER BY occurred_at_epoch DESC NULLS LAST, received_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const events = result.getRowObjects().map((row: Record<string, unknown>) => ({
      event_id: String(row.event_id),
      call_id: row.call_id == null ? null : String(row.call_id),
      event_type: String(row.event_type),
      action: String(row.action),
      occurred_at: row.occurred_at == null ? "" : String(row.occurred_at),
      occurred_at_epoch: row.occurred_at_epoch == null ? null : Number(row.occurred_at_epoch),
      received_at: row.received_at == null ? "" : String(row.received_at),
      payload: jsonObject(row.payload) ?? {},
      raw_payload: jsonObject(row.raw_payload),
    }));
    return { events, total: Number(countResult.getRowObjects()?.[0]?.total ?? 0) };
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
          COALESCE(
            json_extract_string(payload, '$.direction'),
            json_extract_string(payload, '$.call_direction'),
            json_extract_string(payload, '$.va_call_type'),
            json_extract_string(payload, '$.metadata.call_type')
          ) AS direction,
          COALESCE(
            json_extract_string(payload, '$.from'),
            json_extract_string(payload, '$.caller_id_number'),
            json_extract_string(payload, '$.caller_caller_id_number'),
            json_extract_string(payload, '$.user_from')
          ) AS from_number,
          COALESCE(
            json_extract_string(payload, '$.to'),
            json_extract_string(payload, '$.destination_number'),
            json_extract_string(payload, '$.caller_destination_number'),
            json_extract_string(payload, '$.user_to')
          ) AS to_number,
          TRY_CAST(json_extract_string(payload, '$.duration') AS BIGINT) AS cdr_duration,
          TRY_CAST(json_extract_string(payload, '$.billsec') AS BIGINT) AS cdr_billsec
        FROM events
        WHERE call_id IS NOT NULL AND event_type LIKE 'call.%'
      ), calls AS (
        SELECT call_id,
          MIN(CASE
            WHEN event_type = 'call.cdr' AND cdr_duration >= 0
              THEN GREATEST(0, occurred_at_epoch - cdr_duration)
            ELSE occurred_at_epoch
          END) AS started_epoch,
          COALESCE(
            MIN(occurred_at_epoch) FILTER (WHERE event_type = 'call.answered'),
            MIN(occurred_at_epoch - COALESCE(cdr_billsec, cdr_duration)) FILTER (
              WHERE event_type = 'call.cdr'
                AND COALESCE(cdr_billsec, cdr_duration, 0) > 0
            )
          ) AS answered_epoch,
          MAX(occurred_at_epoch) FILTER (
            WHERE event_type IN ('call.completed', 'call.cdr')
          ) AS ended_epoch,
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
