// Shared configuration — import from any backend file.
// Per-customer forks add their own env-bound constants here.
export const PORT = parseInt(Deno.env.get("PORT") || "4001");

// PostgREST — OPTIONAL second data plane. When POSTGREST_URL is set, deno
// exposes it same-origin: POST /connectors/postgrest/auth/login → {url}/rpc/login,
// and /rest/v1/*
// is forwarded (prefix stripped). Unset ⇒ both surfaces answer 503 and the
// app runs mothership-only. NB: no trailing slash.
export const POSTGREST_URL = (Deno.env.get("POSTGREST_URL") || "").replace(/\/$/, "");
export const POSTGREST_ENABLED = POSTGREST_URL !== "";

// ── Engine (voipappz-api, "the brain") — transcript source ─────────────────
// Calls/history are read from the mothership; only consumed Dashboard events
// are retained locally in DuckDB, and call transcripts are read
// on request from the engine event store (`ai.transcribe.done`). Server-side
// basic auth — NEVER exposed to the browser.
// MOTHERSHIP_URL is the ONE knob that repoints a tenant (dev proxy + this
// forwarder read it); ENGINE_URL still wins when the engine lives elsewhere.
export const ENGINE_URL = (Deno.env.get("ENGINE_URL") || Deno.env.get("MOTHERSHIP_URL") || "https://cloud.voipappz.io").replace(/\/$/, "");
export const ENGINE_EMAIL = Deno.env.get("ENGINE_EMAIL") || Deno.env.get("ACCOUNT_EMAIL") || "";
export const ENGINE_PASSWORD = Deno.env.get("ENGINE_PASSWORD") || Deno.env.get("ACCOUNT_PASSWORD") || "";
export const ENGINE_ENABLED = ENGINE_EMAIL !== "" && ENGINE_PASSWORD !== "";

// ── Cable (va-crystal ActionCable server) — optional live UI data ──────────
// When NATS_URL is unset, CallEvents remains a legacy CDR fallback. Once a
// Core-NATS CDR stream is enabled, the server does not consume CDRs from
// Cable; Cable may still bridge DashboardLive agent/extension state.
// Connection auth is an HS256 JWT
// (?token=) carrying an account_uuid claim, signed with the cable SECRET_KEY.
// Provide either a ready-made CABLE_TOKEN, or CABLE_SECRET (= cable's SECRET_KEY)
// + CABLE_ACCOUNT_UUID to mint one at boot. Server-side only — NEVER expose as VITE_*.
// va-crystal's node serves the ActionCable endpoint on port 4000 by default.
// Its Cable backend transports broadcasts over NATS; this consumer speaks the
// stable ActionCable WebSocket protocol rather than coupling to NATS internals.
const configuredCableUrl = (Deno.env.get("CABLE_URL") || "").trim();
export const CABLE_URL = configuredCableUrl || "ws://127.0.0.1:4000/cable";
export const CABLE_CHANNEL = Deno.env.get("CABLE_CHANNEL") || "CallEvents";
export const CABLE_TOKEN = Deno.env.get("CABLE_TOKEN") || "";
export const CABLE_SECRET = Deno.env.get("CABLE_SECRET") || Deno.env.get("SECRET_KEY") || "";
// The CallEvents stream is global, so the JWT's account_uuid claim only needs
// to be present (cable rejects an empty one) — it doesn't filter events. So it
// defaults to a label and the operator normally only sets SECRET_KEY.
export const CABLE_ACCOUNT_UUID = Deno.env.get("CABLE_ACCOUNT_UUID") || "events-consumer";
// Cable clients can start from an explicit endpoint or as soon as cable auth
// resolves. The server decides whether that means CallEvents, DashboardLive,
// or both.
// An explicitly configured URL enables the connection even when authentication
// is handled by the endpoint. Protected va-crystal endpoints still require a
// valid token/secret and will safely disable after bounded failures. If no URL
// is configured, the legacy local default stays dormant unless auth is present.
export const CABLE_ENABLED = configuredCableUrl !== "" || CABLE_TOKEN !== "" || CABLE_SECRET !== "";
// Explicit local functional-test mode. Enables POST /test/crystal/events,
// which injects Crystal-shaped frames through the normal normalize → DuckDB →
// relay path. Keep false/unset in production.
export const MOCK_CRYSTAL_EVENTS = Deno.env.get("MOCK_CRYSTAL_EVENTS") === "1";
// Read-only operational inspector for the local DuckDB event rows. Keep it
// opt-in outside the development compose stack because CDR payloads can carry
// phone numbers and other tenant data.
export const EVENT_INSPECTOR_ENABLED = Deno.env.get("EVENT_INSPECTOR_ENABLED") === "1";
// Read-only Model Context Protocol endpoint over the same local DuckDB. It is
// independently opt-in and requires a dedicated bearer token because raw CDR
// payloads can contain tenant data. Never expose this token through VITE_*.
export const MCP_ENABLED = Deno.env.get("MCP_ENABLED") === "1";
export const MCP_AUTH_TOKEN = Deno.env.get("MCP_AUTH_TOKEN") || "";
// Development Compose enables this localhost-only escape hatch so a host MCP
// client works with zero setup. It is intentionally unset in production.
export const MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN =
  Deno.env.get("MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN") === "1";
// DashboardLive: the live agents/extensions panel is a SEPARATE cable channel
// whose stream is `dashboard:live:{account_uuid}`. Subscribing needs the
// dashboard's uuid (the channel's `Live_uuid` param) + a real account_uuid.
// Set both to bridge the live dashboard to /ws/events as `dashboard.live`
// frames; unset ⇒ the dashboard bridge stays off (calls/transcripts unaffected).
export const CABLE_DASHBOARD_UUID = Deno.env.get("CABLE_DASHBOARD_UUID") || "";
// DashboardLive can contain full widget tables. Coalesce bursts before browser
// fan-out, and stop writing to a client whose socket queue is already backed up.
const dashboardRelayMs = Number.parseInt(Deno.env.get("DASHBOARD_RELAY_INTERVAL_MS") || "250", 10);
export const DASHBOARD_RELAY_INTERVAL_MS = Number.isFinite(dashboardRelayMs)
  ? Math.max(50, dashboardRelayMs)
  : 250;
const wsMaxBufferedBytes = Number.parseInt(Deno.env.get("WS_MAX_BUFFERED_BYTES") || "1048576", 10);
export const WS_MAX_BUFFERED_BYTES = Number.isFinite(wsMaxBufferedBytes)
  ? Math.max(65_536, wsMaxBufferedBytes)
  : 1_048_576;
const wsMaxEventBytes = Number.parseInt(Deno.env.get("WS_MAX_EVENT_BYTES") || "2097152", 10);
export const WS_MAX_EVENT_BYTES = Number.isFinite(wsMaxEventBytes)
  ? Math.max(65_536, wsMaxEventBytes)
  : 2_097_152;
const cableMaxFrameBytes = Number.parseInt(Deno.env.get("CABLE_MAX_FRAME_BYTES") || "2097152", 10);
export const CABLE_MAX_FRAME_BYTES = Number.isFinite(cableMaxFrameBytes)
  ? Math.max(65_536, cableMaxFrameBytes)
  : 2_097_152;
const wsMaxClients = Number.parseInt(Deno.env.get("WS_MAX_CLIENTS") || "200", 10);
export const WS_MAX_CLIENTS = Number.isFinite(wsMaxClients) ? Math.max(1, wsMaxClients) : 200;

// Core-NATS CDR input. The current va-crystal writer publishes batches on
// cdr.write.bulk; deno observes the same message that voipappz-api consumes to
// create EventCdr rows. A deployment with a committed-event producer
// can instead select events.cdr, which also enables RubyEventStore replay.
export const NATS_URL = Deno.env.get("NATS_URL") || "";
export const NATS_ENABLED = NATS_URL !== "";
const configuredCdrSubjects = Deno.env.get("NATS_CDR_SUBJECTS") || "cdr.write.bulk";
export const NATS_CDR_SUBJECTS = [...new Set(
  configuredCdrSubjects.split(",").map((subject) => subject.trim()).filter(Boolean),
)];
export const NATS_REPLAY_ENABLED = NATS_CDR_SUBJECTS.includes("events.cdr");
export const NATS_REPLAY_SUBJECT = "events.cdr.replay";
const reconcileSeconds = Number.parseInt(Deno.env.get("NATS_RECONCILE_SECONDS") || "30", 10);
export const NATS_RECONCILE_SECONDS = Number.isFinite(reconcileSeconds)
  ? Math.max(5, reconcileSeconds)
  : 30;

// Optional InfluxDB connector retained for tenant-specific analytics. The
// current Dashboard uses DuckDB and does not require these settings.
export const INFLUX_URL = (Deno.env.get("INFLUXDB_URL") || "").replace(/\/$/, "");
export const INFLUX_TOKEN = Deno.env.get("INFLUXDB_TOKEN") || "";
export const INFLUX_DATABASE = Deno.env.get("INFLUXDB_DATABASE") || Deno.env.get("INFLUXDB_BUCKET") || "telegraf";
export const INFLUX_ENABLED = INFLUX_URL !== "" && INFLUX_TOKEN !== "";

// Event freshness alarm. This is how long (seconds) the active source can go
// WITHOUT a single event
// before /health reports the stream `stale` (so a silent broker/CDR feed is
// visible instead of showing green). Informational: it degrades status but does
// NOT 503 the container (legitimately-quiet periods shouldn't trigger restarts).
// 0 disables the alarm. Default 15 min.
const staleSeconds = Number.parseInt(Deno.env.get("EVENTS_STALE_SECONDS") || "900", 10);
export const EVENTS_STALE_SECONDS = Number.isFinite(staleSeconds)
  ? Math.max(0, staleSeconds)
  : 900;
