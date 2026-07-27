// Shared configuration — import from any backend file.
// Per-customer forks add their own env-bound constants here.
export const PORT = parseInt(Deno.env.get("PORT") || "4001");

// PostgREST — OPTIONAL second data plane. When POSTGREST_URL is set, deno
// exposes it same-origin: POST /auth/login → {url}/rpc/login, and /rest/v1/*
// is forwarded (prefix stripped). Unset ⇒ both surfaces answer 503 and the
// app runs mothership-only. NB: no trailing slash.
export const POSTGREST_URL = (Deno.env.get("POSTGREST_URL") || "").replace(/\/$/, "");
export const POSTGREST_ENABLED = POSTGREST_URL !== "";

// ── Engine (voipappz-api, "the brain") — transcript source ─────────────────
// No local store: history/calls are read by the browser from PostgREST, the
// Dashboard renders the cable /ws stream as-is, and call transcripts are read
// on request from the engine event store (`ai.transcribe.done`). Server-side
// basic auth — NEVER exposed to the browser.
export const ENGINE_URL = (Deno.env.get("ENGINE_URL") || "https://cloud.voipappz.io").replace(/\/$/, "");
export const ENGINE_EMAIL = Deno.env.get("ENGINE_EMAIL") || Deno.env.get("ACCOUNT_EMAIL") || "";
export const ENGINE_PASSWORD = Deno.env.get("ENGINE_PASSWORD") || Deno.env.get("ACCOUNT_PASSWORD") || "";
export const ENGINE_ENABLED = ENGINE_EMAIL !== "" && ENGINE_PASSWORD !== "";

// ── Cable (va-crystal ActionCable server) — the event source ───────────────
// deno-api subscribes to the cable server's CallEvents channel as a WS client
// and relays broadcasts to browser /ws/events subscribers (no local store — the
// engine event store is the source of truth). Connection auth is an HS256 JWT
// (?token=) carrying an account_uuid claim, signed with the cable SECRET_KEY.
// Provide either a ready-made CABLE_TOKEN, or CABLE_SECRET (= cable's SECRET_KEY)
// + CABLE_ACCOUNT_UUID to mint one at boot. Server-side only — NEVER expose as VITE_*.
export const CABLE_URL = Deno.env.get("CABLE_URL") || "ws://127.0.0.1:6000/cable";
export const CABLE_CHANNEL = Deno.env.get("CABLE_CHANNEL") || "CallEvents";
export const CABLE_TOKEN = Deno.env.get("CABLE_TOKEN") || "";
export const CABLE_SECRET = Deno.env.get("CABLE_SECRET") || Deno.env.get("SECRET_KEY") || "";
// The CallEvents stream is global, so the JWT's account_uuid claim only needs
// to be present (cable rejects an empty one) — it doesn't filter events. So it
// defaults to a label and the operator normally only sets SECRET_KEY.
export const CABLE_ACCOUNT_UUID = Deno.env.get("CABLE_ACCOUNT_UUID") || "events-consumer";
// The cable subscription is on as soon as a token can be resolved — set
// SECRET_KEY (matching the cable) and that's it, or pass a ready-made
// CABLE_TOKEN. No token ⇒ off (relay idle), which is fine for tests/demos.
export const CABLE_ENABLED = CABLE_TOKEN !== "" || CABLE_SECRET !== "";
// DashboardLive: the live agents/extensions panel is a SEPARATE cable channel
// whose stream is `dashboard:live:{account_uuid}`. Subscribing needs the
// dashboard's uuid (the channel's `Live_uuid` param) + a real account_uuid.
// Set both to bridge the live dashboard to /ws/events as `dashboard.live`
// frames; unset ⇒ the dashboard bridge stays off (calls/transcripts unaffected).
export const CABLE_DASHBOARD_UUID = Deno.env.get("CABLE_DASHBOARD_UUID") || "";

// ── InfluxDB 3 (monitoring.voipappz.com) — dashboard time-series source ─────
// The dashboard's aggregated call metrics (calls-per-hour, KPIs) come from the
// InfluxDB 3 `cdr` measurement — the role the removed DuckDB projections used to
// fill. deno-api runs the influxdb3 client SERVER-SIDE so the apiv3_ token never
// reaches the browser; the React dashboard fetches `/dashboard/*`. InfluxDB 3
// speaks SQL over POST {url}/api/v3/query_sql with a Bearer token.
// NB: the token is a secret — set via env, never commit it.
// NB: InfluxDB 3 Core typically listens on plain HTTP at :8181 (https/443 is
// not it). Both URL and token must be set to enable the feature — no default
// monitoring host is baked in.
export const INFLUX_URL = (Deno.env.get("INFLUXDB_URL") || "").replace(/\/$/, "");
export const INFLUX_TOKEN = Deno.env.get("INFLUXDB_TOKEN") || "";
export const INFLUX_DATABASE = Deno.env.get("INFLUXDB_DATABASE") || Deno.env.get("INFLUXDB_BUCKET") || "telegraf";
export const INFLUX_ENABLED = INFLUX_URL !== "" && INFLUX_TOKEN !== "";

// Event freshness alarm — `cable_ready` only means "subscribed", not "events are
// flowing". This is how long (seconds) the cable can go WITHOUT a single event
// before /health reports the stream `stale` (so a silent broker/CDR feed is
// visible instead of showing green). Informational: it degrades status but does
// NOT 503 the container (legitimately-quiet periods shouldn't trigger restarts).
// 0 disables the alarm. Default 15 min.
export const EVENTS_STALE_SECONDS = parseInt(Deno.env.get("EVENTS_STALE_SECONDS") || "900");
