// HTTP + WebSocket server — thin BFF over the engine. NO local store (DuckDB
// removed). Data plane split:
//   - calls / history  → the browser reads PostgREST directly
//   - Dashboard (live)  → the cable /ws stream, relayed as-is (no projection)
//   - transcripts       → read on request from the engine (api/engine.ts)
//   - auth              → /auth/login proxies PostgREST /rpc/login
//
// Pipeline (live relay only):
//   FreeSWITCH → LavinMQ → va-crystal cable (CallEvents) → deno cable client
//   → normalizeCableEvent → fan out to /ws/events subscribers (the Dashboard).
//   deno holds nothing; the engine event store is the single source of truth.
import {
  PORT, CABLE_URL, CABLE_CHANNEL, CABLE_TOKEN, CABLE_SECRET, CABLE_ACCOUNT_UUID, CABLE_ENABLED,
  CABLE_DASHBOARD_UUID, POSTGREST_URL, ENGINE_ENABLED, EVENTS_STALE_SECONDS,
} from './config.ts';
import { createJwtVerifier, unauthorizedResponse, type JwtVerifier } from './auth_middleware.ts';
import { fetchTranscript } from './engine.ts';
import { dashboardCallsPerHour } from './influx.ts';
import { INFLUX_ENABLED } from './config.ts';
import { eventFreshness, type Freshness } from './health_freshness.ts';
import { createCableClient, mintCableToken, type CableClient } from "./cable.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };

const STATIC_DIR = Deno.env.get("STATIC_DIR") || "./dist";

// ── Health check ──────────────────────────────────────────────────────
// Actively probes every dependency the service needs:
//   - cable    (va-crystal ActionCable)    → live subscription flag (Dashboard realtime)
//   - events   (freshness)                 → stale if the cable goes silent
//   - engine   (voipappz-api)              → transcript reads
//   - supabase (optional users table)      → HEAD count on `users`
//
// A dependency that is configured-but-unreachable is "down"; one that isn't
// configured at all (e.g. Supabase in local DuckDB-only dev) is "disabled" and
// does NOT fail the check. Overall `healthy` is false iff any required
// dependency is down — callers map that to HTTP 503.
interface DepStatus { status: "up" | "down" | "disabled"; detail?: string }
interface HealthReport {
  healthy: boolean;
  status: "ok" | "degraded";
  checks: { cable: DepStatus; events: Freshness; engine: DepStatus };
  timestamp: string;
}

async function checkHealth(): Promise<HealthReport> {
  // Cable — the WS client reconnects on its own; the flag reflects whether the
  // CallEvents subscription is currently confirmed. Not enabled (no token) ⇒
  // disabled, which does NOT fail the check (seed-only / mock runs).
  const cable: DepStatus = !CABLE_ENABLED
    ? { status: "disabled", detail: "cable tap off (no token)" }
    : (cableClient?.ready() ? { status: "up" } : { status: "down", detail: "cable not subscribed" });

  // Engine — backfill source for transcripts. Not configured ⇒ disabled.
  const engine: DepStatus = !ENGINE_ENABLED
    ? { status: "disabled", detail: "ENGINE creds unset" }
    : { status: "up" };

  // Event freshness — distinct from `cable` (subscribed) — surfaces a silent
  // stream as `stale`. Informational: never fails `healthy` (so quiet periods
  // don't restart the container), but degrades `status` for monitoring.
  const events = eventFreshness(lastCableEventAt, Date.now(), EVENTS_STALE_SECONDS, CABLE_ENABLED);

  const checks = { cable, events, engine };
  // Only a hard "down" fails the container healthcheck. `stale`/`idle` are
  // visible-but-not-fatal so a legitimately-quiet stream never triggers restarts.
  const healthy = Object.values(checks).every((c) => c.status !== "down");
  const clean = healthy && Object.values(checks).every((c) => c.status !== "stale" && c.status !== "idle");
  return {
    healthy,
    status: clean ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  };
}

// ── Topic matcher (RabbitMQ topic spec) — used for /ws/events subscriptions ──
function routingKeyMatches(pattern: string, key: string): boolean {
  const p = pattern.split('.');
  const k = key.split('.');
  let pi = 0, ki = 0;
  while (pi < p.length) {
    if (p[pi] === '#') return true;
    if (k[ki] === undefined) return false;
    if (p[pi] !== '*' && p[pi] !== k[ki]) return false;
    pi++; ki++;
  }
  return ki === k.length;
}

// ── Bus state ─────────────────────────────────────────────────────────
interface Subscriber { ws: WebSocket; topics: Set<string>; }
const subscribers = new Map<WebSocket, Subscriber>();
let relayedCounter = 0;   // events relayed to /ws subscribers
let tappedCounter = 0;    // everything received from cable
let cableClient: CableClient | null = null;
let dashboardCableClient: CableClient | null = null;  // DashboardLive (agents/extensions stream)
let lastCableEventAt: number | null = null;   // epoch ms of the last cable event (freshness)

// Single emit path — fan a canonical event out to matching /ws subscribers. No
// persistence: the engine event store is the source of truth and the Dashboard
// renders this live cable stream as-is.
function emitEvent(type: string, payload: Pojo, occurredAtIso?: string): void {
  relayedCounter++;
  const occurred_at = occurredAtIso ?? new Date().toISOString();
  const event = { type, ts: occurred_at, seq: relayedCounter, payload };
  const json = JSON.stringify(event);
  for (const sub of subscribers.values()) {
    if ([...sub.topics].some((pat) => routingKeyMatches(pat, type))) {
      try { sub.ws.send(json); } catch { /* dead socket */ }
    }
  }
}

type Pojo = Record<string, any>;

// Subscribe to the cable server's CallEvents channel and relay broadcasts to
// browser /ws subscribers. Reconnect/keepalive live in createCableClient. The
// token is resolved once at startup: explicit CABLE_TOKEN, else minted from
// CABLE_SECRET (= cable's SECRET_KEY) + CABLE_ACCOUNT_UUID.
async function startCableClient() {

  const token = CABLE_TOKEN ||
    (CABLE_SECRET && CABLE_ACCOUNT_UUID ? await mintCableToken(CABLE_SECRET, CABLE_ACCOUNT_UUID) : "");
  if (!token) {
    console.log("🔇 cable tap off — set CABLE_TOKEN, or CABLE_SECRET + CABLE_ACCOUNT_UUID");
    return;
  }

  cableClient = createCableClient({
    url: CABLE_URL,
    token,
    channel: CABLE_CHANNEL,
    log: (m) => console.log(`📡 ${m}`),
    onEvent: (n) => {
      tappedCounter++;
      lastCableEventAt = Date.now();   // freshness stamp
      // Relay the canonical event as-is to /ws subscribers (the Dashboard).
      // occurredAtIso comes from the cable event's created_at.
      emitEvent(n.wsType, n.wsPayload, n.occurredAtIso);
    },
  });
  console.log(`📡 cable client → ${CABLE_URL} channel=${CABLE_CHANNEL}`);

  // DashboardLive — the live agents/extensions panel. Separate channel; its
  // stream is dashboard:live:{account_uuid}. The broadcast is a value map
  // { "<widget_uuid>": { type:"table", table:[ {uuid, …fields} ] } } produced
  // by va-crystal from the voipappz-api dashboard structure (saved in Redis).
  // We pass it through untouched as a `dashboard.live` /ws frame — the browser
  // renders it. Needs a real account_uuid + the dashboard uuid (Live_uuid).
  if (CABLE_DASHBOARD_UUID && CABLE_ACCOUNT_UUID && CABLE_ACCOUNT_UUID !== "events-consumer") {
    dashboardCableClient = createCableClient({
      url: CABLE_URL,
      token,
      identifier: { channel: "DashboardLive", account_uuid: CABLE_ACCOUNT_UUID, Live_uuid: CABLE_DASHBOARD_UUID },
      log: (m) => console.log(`📊 ${m}`),
      onRaw: (message) => {
        lastCableEventAt = Date.now();
        // payload = widget_uuid → { type, table }. Render-ready for the client.
        emitEvent("dashboard.live", (message && typeof message === "object") ? message as Pojo : { raw: message });
      },
    });
    console.log(`📊 dashboard cable client → ${CABLE_URL} channel=DashboardLive dashboard=${CABLE_DASHBOARD_UUID}`);
  } else {
    console.log("📊 dashboard cable bridge off — set CABLE_DASHBOARD_UUID + a real CABLE_ACCOUNT_UUID");
  }
}

// ── WS lifecycle ──────────────────────────────────────────────────────
function handleWebSocket(request: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(request);
  const url = new URL(request.url);
  const initialTopics = (url.searchParams.get("topics") || "#").split(',').map((s) => s.trim()).filter(Boolean);
  socket.addEventListener("open", () => {
    const sub: Subscriber = { ws: socket, topics: new Set(initialTopics) };
    subscribers.set(socket, sub);
    socket.send(JSON.stringify({ type: "welcome", ts: new Date().toISOString(), subscribed: [...sub.topics], clients: subscribers.size, cable_ready: cableClient?.ready() ?? false }));
  });
  socket.addEventListener("close", () => { subscribers.delete(socket); });
  socket.addEventListener("error", () => { subscribers.delete(socket); });
  socket.addEventListener("message", (e) => {
    const sub = subscribers.get(socket);
    if (!sub) return;
    let msg: any;
    try { msg = JSON.parse(typeof e.data === "string" ? e.data : ""); } catch { return; }
    if (msg.action === "subscribe" && typeof msg.topic === "string") {
      sub.topics.add(msg.topic);
      socket.send(JSON.stringify({ type: "subscribed", topic: msg.topic, subscribed: [...sub.topics] }));
    } else if (msg.action === "unsubscribe" && typeof msg.topic === "string") {
      sub.topics.delete(msg.topic);
      socket.send(JSON.stringify({ type: "unsubscribed", topic: msg.topic, subscribed: [...sub.topics] }));
    }
  });
  return response;
}

// ── Static + helpers ──────────────────────────────────────────────────
const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  map: "application/json", txt: "text/plain; charset=utf-8",
};
function mimeFor(p: string) { return MIME_TYPES[p.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream"; }
async function readIfFile(path: string): Promise<Uint8Array | null> {
  try { const stat = await Deno.stat(path); if (!stat.isFile) return null; return await Deno.readFile(path); } catch { return null; }
}
async function serveStatic(pathname: string): Promise<Response | null> {
  if (pathname.includes("..")) return new Response("Forbidden", { status: 403 });
  const rel = pathname === "/" || pathname.endsWith("/") ? `${pathname}index.html`.replace(/^\/+/, "") : pathname.replace(/^\/+/, "");
  const direct = await readIfFile(`${STATIC_DIR}/${rel}`);
  if (direct) return new Response(direct as BodyInit, { status: 200, headers: { "Content-Type": mimeFor(rel) } });
  if (!rel.includes(".")) {
    const index = await readIfFile(`${STATIC_DIR}/index.html`);
    if (index) return new Response(index as BodyInit, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return null;
}

export function createRequestHandler(jwtVerifier?: JwtVerifier) {
  const verifyJwt = jwtVerifier || createJwtVerifier();
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    // ── Login (deno is the brain) — POST /auth/login {email,password} ─────
    // Proxies to PostgREST's users-backed `api.login` RPC and returns the
    // signed JWT (role api_readonly + user_uuid/environment_uuid claims). The
    // browser stores it and sends it back as the bearer on every request. This
    // replaces Supabase Auth: one user login, one token, single source. The
    // environment_uuid claim scopes api.calls to the user's environment.
    // NB: path is /auth/login (not /login) so it never collides with the SPA's
    // own `/login` page route when deno serves the bundle in production.
    if (request.method === "POST" && url.pathname === "/auth/login") {
      let creds: { email?: string; password?: string } = {};
      try { creds = await request.json(); } catch { /* bad body → handled below */ }
      if (!creds.email || !creds.password) {
        return new Response(JSON.stringify({ error: "email and password are required" }), { status: 400, headers: JSON_HEADERS });
      }
      try {
        const r = await fetch(`${POSTGREST_URL}/rpc/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: creds.email, password: creds.password }),
        });
        const text = await r.text();
        // PostgREST raises insufficient_privilege (→ 403/401) for bad creds; map
        // anything non-2xx to 401 with a generic message (don't leak which part failed).
        if (!r.ok) {
          return new Response(JSON.stringify({ error: "invalid email or password" }), { status: 401, headers: JSON_HEADERS });
        }
        return new Response(text, { status: 200, headers: JSON_HEADERS });
      } catch (err) {
        console.error("login proxy failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "login upstream unavailable" }), { status: 502, headers: JSON_HEADERS });
      }
    }

    if (url.pathname === "/ws/events" && request.headers.get("upgrade") === "websocket") return handleWebSocket(request);

    // ── Call transcript — GET /calls/:id/transcript ──
    // Read on request from the engine event store (the mothership's transcription
    // workflow persists `ai.transcribe.done`). No local copy. JWT-gated.
    if (request.method === "GET" && url.pathname.endsWith("/transcript") && url.pathname.startsWith("/calls/")) {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated) return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      const id = decodeURIComponent(url.pathname.slice("/calls/".length, -"/transcript".length));
      try {
        return new Response(JSON.stringify(await fetchTranscript(id)), { status: 200, headers: JSON_HEADERS });
      } catch (err) {
        console.error("transcript read failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "transcript upstream unavailable" }), { status: 502, headers: JSON_HEADERS });
      }
    }

    // ── Dashboard calls-per-hour — GET /dashboard/calls-per-hour ──
    // InfluxDB 3 (monitoring.voipappz.com) `cdr` measurement, bucketed per hour
    // and split by direction. The influxdb3 client runs server-side so the
    // apiv3_ token never reaches the browser. JWT-gated; env-scoped via ?env=
    // (repeatable / comma list). ?minutes= window (default 1440).
    if (request.method === "GET" && url.pathname === "/dashboard/calls-per-hour") {
      const authResult = await verifyJwt(request);
      // Auth gate is temporarily relaxed ONLY when no auth backend is configured
      // (the Supabase verifier is vestigial after the accounts-JWT migration — it
      // reports "Auth not configured"). A real verifier still rejects bad tokens,
      // so this re-gates automatically once deno verifies the accounts JWT.
      // TODO: verify the accounts JWT here and drop this exception.
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      if (!INFLUX_ENABLED) {
        return new Response(JSON.stringify({ error: "influxdb not configured", points: [] }), { status: 503, headers: JSON_HEADERS });
      }
      const minutes = parseInt(url.searchParams.get("minutes") || "1440");
      const environmentUuids = url.searchParams.getAll("env").flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
      try {
        const points = await dashboardCallsPerHour({ minutes, environmentUuids });
        return new Response(JSON.stringify({ points }), { status: 200, headers: JSON_HEADERS });
      } catch (err) {
        console.error("dashboard calls-per-hour failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "influxdb upstream unavailable", points: [] }), { status: 502, headers: JSON_HEADERS });
      }
    }

    // Health probe (cable + events freshness + engine + supabase). Used by
    // Kamal's container healthcheck — returns 503 when any required dep is down.
    if (url.pathname === "/health") {
      const report = await checkHealth();
      return new Response(JSON.stringify(report), {
        status: report.healthy ? 200 : 503,
        headers: JSON_HEADERS,
      });
    }

    if (url.pathname === "/test") {
      const fresh = eventFreshness(lastCableEventAt, Date.now(), EVENTS_STALE_SECONDS, CABLE_ENABLED);
      return new Response(JSON.stringify({
        status: "ok", template: "voipappz",
        cable_ready: cableClient?.ready() ?? false, cable_url: CABLE_URL, cable_channel: CABLE_CHANNEL,
        ws_clients: subscribers.size, relayed: relayedCounter, tapped: tappedCounter,
        last_event_at: fresh.last_event_at, seconds_since_last_event: fresh.age_seconds, events_status: fresh.status,
        engine: ENGINE_ENABLED, timestamp: new Date().toISOString(),
      }), { status: 200, headers: JSON_HEADERS });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const staticResponse = await serveStatic(url.pathname);
      if (staticResponse) return staticResponse;
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
  };
}

export function startServer() {
  console.log(`🎯 voipappz app — http://localhost:${PORT}  (ws: ws://localhost:${PORT}/ws/events)`);
  console.log(`🧠 Dashboard → cable /ws (live); transcripts → engine (${ENGINE_ENABLED ? "on" : "off"})`);

  // Live cable subscription (default ON when a token resolves) → relayed to /ws
  // for the Dashboard. No token ⇒ relay idle (fine for tests/demos).
  if (CABLE_ENABLED) startCableClient();
  else console.log(`🔇 cable tap disabled (no token) — relay idle`);

  // TLS: when TLS_CERT_FILE + TLS_KEY_FILE point at readable PEM files, serve
  // HTTPS on the same PORT (the cert is read once at boot). Otherwise plain HTTP.
  // Used on the MTN deploy to serve https on :8888 with the host's own cert
  // (mounted read-only); no cert env ⇒ unchanged HTTP behaviour everywhere else.
  const certFile = Deno.env.get("TLS_CERT_FILE");
  const keyFile = Deno.env.get("TLS_KEY_FILE");
  if (certFile && keyFile) {
    try {
      const cert = Deno.readTextFileSync(certFile);
      const key = Deno.readTextFileSync(keyFile);
      console.log(`🔒 TLS enabled — https on :${PORT} (cert: ${certFile})`);
      Deno.serve({ port: PORT, cert, key }, createRequestHandler());
      return;
    } catch (err) {
      console.error(`⚠️ TLS_CERT_FILE/TLS_KEY_FILE set but unreadable — falling back to HTTP:`, err instanceof Error ? err.message : err);
    }
  }
  Deno.serve({ port: PORT }, createRequestHandler());
}
