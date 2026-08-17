// HTTP + WebSocket server — thin BFF over the engine with a Dashboard-only
// local DuckDB event store. Data plane split:
//   - calls / reports  → mothership voipappz-api via the same-origin forwarder
//   - Dashboard          → consumed CDR records in DuckDB + direct live relay
//   - transcripts       → read on request from the engine (api/engine.ts)
//   - auth              → mothership /auth/*; optional PostgREST login is isolated
//
// CDR pipeline (current system):
//   va-crystal → Core NATS cdr.write.bulk → voipappz-api EventCdr insertion
//                                  └──────→ this Deno observer → DuckDB.
// The optional events.cdr mode consumes committed envelopes and closes gaps by
// request/reply replay.
import {
  PORT, CABLE_URL, CABLE_CHANNEL, CABLE_TOKEN, CABLE_ENABLED,
  POSTGREST_URL, POSTGREST_ENABLED, ENGINE_URL, ENGINE_ENABLED, EVENTS_STALE_SECONDS,
  MOCK_CRYSTAL_EVENTS, EVENT_INSPECTOR_ENABLED, NATS_URL, NATS_CDR_SUBJECTS, NATS_ENABLED,
  NATS_REPLAY_ENABLED, NATS_REPLAY_SUBJECT, NATS_RECONCILE_SECONDS, MCP_ENABLED, MCP_AUTH_TOKEN,
  MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN, DASHBOARD_RELAY_INTERVAL_MS, WS_MAX_BUFFERED_BYTES, WS_MAX_EVENT_BYTES,
  CABLE_MAX_FRAME_BYTES, WS_MAX_CLIENTS,
} from './config.ts';
import { createJwtVerifier, requestToken, unauthorizedResponse, type JwtVerifier } from './auth_middleware.ts';
import { fetchTranscript } from './engine.ts';
import { eventFreshness, type Freshness } from './health_freshness.ts';
import { createCableClient, normalizeCableEvent, type CableClient, type Normalized } from "./cable.ts";
import { normalizeNatsMessage } from "./event_ingestion.ts";
import { createNatsConsumer, type NatsConsumer } from './nats.ts';
import {
  EventStore, type DashboardDefinition, type EventStoreStats, type WidgetDefinition,
} from "./event_store.ts";
import { CDR_SYNC_SOURCE, reconcileEventCdr } from './cdr_reconciliation.ts';
import { mockCrystalCallSequence } from "./mock_crystal_events.ts";
import { dashboardCallsPerHour } from './influx.ts';
import { INFLUX_ENABLED } from './config.ts';
import { createDuckDbMcpHandler, type DuckDbMcpReader } from "./mcp.ts";
import { canSendRealtime, createCoalescingRelay } from './realtime_relay.ts';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };
const CALL_EVENTS_CABLE_ENABLED = CABLE_ENABLED && !NATS_ENABLED;

// Mothership (voipappz-api) paths the BFF forwards same-origin — see the
// forwarder block in the request handler.
const MOTHERSHIP_PREFIXES = ["/api/", "/auth/", "/tasks/"];

// PostgREST — optional /rest/v1/* forward (prefix stripped; PostgREST itself
// has no /rest/v1 route). Auth passes through untouched: PostgREST verifies
// the request's own JWT. Range/Prefer/Content-Range ride along so PostgREST
// paging + exact counts work from the browser.
async function forwardToPostgrest(request: Request, url: URL): Promise<Response> {
  if (!POSTGREST_ENABLED) {
    return new Response(JSON.stringify({ error: "postgrest not configured" }), { status: 503, headers: JSON_HEADERS });
  }
  const path = url.pathname.slice("/rest/v1".length) || "/";
  const headers = new Headers();
  for (const h of ["authorization", "content-type", "accept", "prefer", "range", "range-unit"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  try {
    const res = await fetch(`${POSTGREST_URL}${path}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
    });
    const out = new Headers(CORS_HEADERS);
    for (const h of ["content-type", "content-range", "range-unit", "preference-applied"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(res.body, { status: res.status, headers: out });
  } catch (err) {
    console.error("postgrest forward failed:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "postgrest unreachable" }), { status: 502, headers: JSON_HEADERS });
  }
}

async function forwardToMothership(request: Request, url: URL): Promise<Response> {
  const target = `${ENGINE_URL}${url.pathname}${url.search}`;
  const headers = new Headers();
  for (const h of ["authorization", "content-type", "accept"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      // Buffer the body (login/OTP payloads are tiny) — simplest cross-runtime-safe way.
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
    });
    const out = new Headers(CORS_HEADERS);
    for (const h of ["content-type", "x-total"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(res.body, { status: res.status, headers: out });
  } catch (err) {
    console.error("mothership forward failed:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "mothership unreachable" }), { status: 502, headers: JSON_HEADERS });
  }
}

const STATIC_DIR = Deno.env.get("STATIC_DIR") || "./dist";

// ── Health check ──────────────────────────────────────────────────────
// Actively probes every dependency the service needs:
//   - cable    (va-crystal ActionCable)    → live subscription flag (Dashboard realtime)
//   - events   (freshness)                 → stale if the cable goes silent
//   - engine   (voipappz-api)              → transcript reads
//
// A dependency that is configured-but-unreachable is "down"; one that isn't
// configured at all is "disabled". Cable is an optional event source, so its
// connection state degrades diagnostics but never takes the API out of service.
// Required local dependencies still map a failed `healthy` result to HTTP 503.
interface DepStatus { status: "up" | "down" | "stale" | "idle" | "disabled"; detail?: string; [key: string]: unknown }
interface HealthReport {
  healthy: boolean;
  ready: boolean;
  status: "ok" | "degraded";
  checks: {
    cable: DepStatus; nats: DepStatus; cdr_sync: DepStatus;
    events: Freshness; event_store: EventStoreStats | DepStatus; engine: DepStatus;
  };
  event_pipeline: {
    received: number;
    persisted: number;
    duplicates: number;
    persistence_failures: number;
    relayed: number;
    websocket_backpressure_drops: number;
    websocket_oversized_drops: number;
    dashboard_frames_received: number;
    dashboard_frames_coalesced: number;
  };
  timestamp: string;
}

async function checkHealth(): Promise<HealthReport> {
  // Cable — the WS client reconnects on its own; the flag reflects whether the
  // CallEvents subscription is currently confirmed. Not enabled ⇒
  // disabled, which does NOT fail the check (seed-only / mock runs).
  const cable: DepStatus = !CALL_EVENTS_CABLE_ENABLED
    ? { status: "disabled", detail: NATS_ENABLED ? "CallEvents replaced by Core NATS CDR input" : "cable tap off (endpoint/auth unset)" }
    : cableClient?.disabled()
    ? { status: "disabled", detail: "cable unavailable; retries exhausted" }
    : cableClient?.ready() ? { status: "up" } : { status: "down", detail: "cable connecting" };

  // Engine — backfill source for transcripts. Not configured ⇒ disabled.
  const engine: DepStatus = !ENGINE_ENABLED
    ? { status: "disabled", detail: "ENGINE creds unset" }
    : { status: "up" };

  // Event freshness — distinct from `cable` (subscribed) — surfaces a silent
  // stream as `stale`. Informational: never fails `healthy` (so quiet periods
  // don't restart the container), but degrades `status` for monitoring.
  const eventSourceEnabled = (CALL_EVENTS_CABLE_ENABLED && !cableClient?.disabled()) || NATS_ENABLED || MOCK_CRYSTAL_EVENTS;
  const events = eventFreshness(lastCallEventAt, Date.now(), EVENTS_STALE_SECONDS, eventSourceEnabled);
  const eventStoreHealth: EventStoreStats | DepStatus = !eventSourceEnabled
    ? { status: "disabled", detail: "CDR source and Crystal mock are off" }
    : await eventStore.stats();

  const nats: DepStatus = !NATS_ENABLED
    ? { status: "disabled", detail: "CDR stream disabled (NATS_URL unset)" }
    : (natsConsumer?.ready()
      ? { status: "up", detail: `subscribed to ${NATS_CDR_SUBJECTS.join(", ")}` }
      : { status: "down", detail: "Core NATS not connected" });
  const syncState = NATS_ENABLED && NATS_REPLAY_ENABLED ? await eventStore.syncState(CDR_SYNC_SOURCE) : null;
  const syncAge = syncState?.last_reconciled_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(`${syncState.last_reconciled_at}Z`.replace('ZZ', 'Z'))) / 1000))
    : null;
  const cdrSync: DepStatus = !NATS_ENABLED
    ? { status: "disabled", detail: "EventCdr reconciliation disabled" }
    : !NATS_REPLAY_ENABLED
    ? { status: "disabled", detail: "raw cdr.write input has no replay service" }
    : !syncState
    ? { status: "idle", detail: "waiting for first EventCdr reconciliation" }
    : syncState.last_error
    ? { status: "down", detail: syncState.last_error, cursor_event_id: syncState.cursor_event_id, head_event_id: syncState.head_event_id }
    : !syncState.caught_up
    ? { status: "stale", detail: "EventCdr replay is catching up", cursor_event_id: syncState.cursor_event_id, head_event_id: syncState.head_event_id }
    : syncAge != null && syncAge > NATS_RECONCILE_SECONDS * 3
    ? { status: "stale", detail: `last reconciliation ${syncAge}s ago`, age_seconds: syncAge,
        cursor_event_id: syncState.cursor_event_id, head_event_id: syncState.head_event_id }
    : { status: "up", detail: "RubyEventStore reconciled", age_seconds: syncAge,
        cursor_event_id: syncState.cursor_event_id, head_event_id: syncState.head_event_id };

  const checks = { cable, nats, cdr_sync: cdrSync, events, event_store: eventStoreHealth, engine };
  // /health is liveness-compatible: a Cable/broker outage must not restart the
  // process and erase diagnostic state. Cable remains visible as down while it
  // retries, then disabled, but API/DuckDB availability owns liveness.
  // /health/ready is the strict Core-NATS data gate when NATS is configured.
  const healthy = [eventStoreHealth, engine].every((c) => c.status !== "down");
  const ready = healthy && (!NATS_ENABLED || (
    nats.status === "up" && (!NATS_REPLAY_ENABLED || cdrSync.status === "up")
  ));
  const clean = ready && Object.values(checks).every((check) =>
    check.status !== "stale" && check.status !== "idle"
  );
  return {
    healthy,
    ready,
    status: clean ? "ok" : "degraded",
    checks,
    event_pipeline: {
      received: tappedCounter,
      persisted: persistedCounter,
      duplicates: duplicateCounter,
      persistence_failures: persistenceFailureCounter,
      relayed: relayedCounter,
      websocket_backpressure_drops: websocketBackpressureDropCounter,
      websocket_oversized_drops: websocketOversizedDropCounter,
      dashboard_frames_received: dashboardFramesReceived,
      dashboard_frames_coalesced: dashboardFramesCoalesced,
    },
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
// `environmentUuid` comes from the caller's own login token. The cable streams
// are global, so it is what keeps one tenant's browser from being handed
// another tenant's call events. Empty means unrestricted — an unauthenticated
// test harness, or a token that carries no environment claim.
interface Subscriber { ws: WebSocket; topics: Set<string>; environmentUuid: string; }
const subscribers = new Map<WebSocket, Subscriber>();
let relayedCounter = 0;   // events relayed to /ws subscribers
let tappedCounter = 0;    // everything received from cable
let persistedCounter = 0; // newly inserted DuckDB events
let duplicateCounter = 0; // idempotent Cable redeliveries
let persistenceFailureCounter = 0;
let websocketBackpressureDropCounter = 0;
let websocketOversizedDropCounter = 0;
let dashboardFramesReceived = 0;
let dashboardFramesCoalesced = 0;
let cableClient: CableClient | null = null;
let natsConsumer: NatsConsumer | null = null;
let reconciliationRunning = false;
let lastCallEventAt: number | null = null;    // last accepted CallEvents message; DashboardLive does not mask silence
const eventStore = new EventStore();

// Single emit path — fan a canonical event out to matching /ws subscribers.
// The CallEvents handler persists first; DashboardLive remains relay-only.
function emitEvent(type: string, payload: Pojo, occurredAtIso?: string): void {
  relayedCounter++;
  const occurred_at = occurredAtIso ?? new Date().toISOString();
  const event = { type, ts: occurred_at, seq: relayedCounter, payload };
  const json = JSON.stringify(event);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > WS_MAX_EVENT_BYTES) {
    websocketOversizedDropCounter++;
    console.warn(`websocket event dropped: type=${type} bytes=${bytes} limit=${WS_MAX_EVENT_BYTES}`);
    return;
  }
  // Only filter when BOTH sides know their environment: an event that carries
  // no environment (dashboard frames, transcripts) still reaches everyone, and a
  // subscriber with no claim keeps the previous unfiltered behaviour.
  const eventEnvironment = typeof payload?.environment_uuid === "string" ? payload.environment_uuid : "";
  for (const sub of subscribers.values()) {
    if (sub.environmentUuid && eventEnvironment && sub.environmentUuid !== eventEnvironment) continue;
    if ([...sub.topics].some((pat) => routingKeyMatches(pat, type))) {
      if (!canSendRealtime(sub.ws, WS_MAX_BUFFERED_BYTES)) {
        websocketBackpressureDropCounter++;
        continue;
      }
      try { sub.ws.send(json); } catch { websocketBackpressureDropCounter++; }
    }
  }
}


// One acceptance path for both the live Cable client and the explicit Crystal
// mock. An event is visible to browser consumers only after DuckDB accepted it.
async function consumeCallEvent(n: Normalized): Promise<boolean> {
  tappedCounter++;
  lastCallEventAt = Date.now();
  try {
    const result = await eventStore.ingest(n);
    if (result.inserted) persistedCounter++;
    else duplicateCounter++;
  } catch (err) {
    persistenceFailureCounter++;
    console.error("event store write failed:", err instanceof Error ? err.message : err);
    return false;
  }
  emitEvent(n.wsType, n.wsPayload, n.occurredAtIso);
  return true;
}

type Pojo = Record<string, any>;

// Subscribe to the cable server's CallEvents channel and relay broadcasts to
// browser /ws subscribers. Reconnect/keepalive live in createCableClient.
// These are the USERLESS taps, so the only credential they can have is one an
// operator supplied outright. Per-user streams do not come through here — they
// use the caller's own login token, in handleWebSocket.
async function startCableClient() {

  // Open the local store before subscribing so received events can be persisted
  // before they are relayed to browser consumers.
  await eventStore.open();

  const token = CABLE_TOKEN;
  if (!token) console.log("📡 cable auth → endpoint-managed/anonymous");

  if (CALL_EVENTS_CABLE_ENABLED) {
    cableClient = createCableClient({
      url: CABLE_URL,
      token,
      channel: CABLE_CHANNEL,
      maxFrameBytes: CABLE_MAX_FRAME_BYTES,
      log: (m) => console.log(`📡 ${m}`),
      onEvent: async (event) => { await consumeCallEvent(event); },
    });
    console.log(`📡 legacy CallEvents cable → ${CABLE_URL} channel=${CABLE_CHANNEL}`);
  } else {
    console.log(`📡 CallEvents cable off — Core NATS is the exclusive CDR source`);
  }

  // DashboardLive used to run here as a third userless singleton, keyed by a
  // CABLE_ACCOUNT_UUID env var. It is account-scoped, so it belongs on the
  // caller's own connection like StateChannel does — see handleWebSocket, which
  // takes the account from the login token instead of from configuration.
}

async function startNatsClient() {
  await eventStore.open();
  natsConsumer = await createNatsConsumer({
    url: NATS_URL,
    subjects: NATS_CDR_SUBJECTS,
    log: (message) => console.log(`📨 ${message}`),
    onMessage: async ({ subject, data }) => {
      const text = new TextDecoder().decode(data);
      for (const event of normalizeNatsMessage(subject, text)) await consumeCallEvent(event);
    },
  });
  console.log(`📨 Core NATS CDR source ready — subjects=${NATS_CDR_SUBJECTS.join(",")}`);
  if (NATS_REPLAY_ENABLED) {
    void reconcileCdrEvents();
    setInterval(() => { void reconcileCdrEvents(); }, NATS_RECONCILE_SECONDS * 1000);
  }
}

async function reconcileCdrEvents(): Promise<void> {
  if (reconciliationRunning || !NATS_ENABLED || !NATS_REPLAY_ENABLED) return;
  reconciliationRunning = true;
  try {
    const result = await reconcileEventCdr(eventStore, async (request) => {
      if (!natsConsumer) throw new Error('Core NATS connection is not ready');
      const reply = await natsConsumer.request(NATS_REPLAY_SUBJECT, JSON.stringify(request));
      return JSON.parse(new TextDecoder().decode(reply.data));
    });
    tappedCounter += result.inserted + result.duplicates;
    persistedCounter += result.inserted;
    duplicateCounter += result.duplicates;
    if (result.inserted + result.duplicates > 0) lastCallEventAt = Date.now();
    console.log(`🔄 EventCdr reconciled pages=${result.pages} inserted=${result.inserted} duplicates=${result.duplicates}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await eventStore.recordSyncError(CDR_SYNC_SOURCE, message); } catch { /* store health reports this */ }
    console.error(`EventCdr reconciliation failed: ${message}`);
  } finally {
    reconciliationRunning = false;
  }
}

// Claims of a JWT we did not issue and do not verify — the cable verifies it
// against its own SECRET_KEY. We only read it to learn WHICH user's stream to
// open. Returns {} for an opaque (non-JWT) token.
function tokenClaims(token: string): Record<string, any> {
  try {
    const part = token.split('.')[1] || '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(b64.length + ((4 - b64.length % 4) % 4), '=')));
  } catch {
    return {};
  }
}

// ── WS lifecycle ──────────────────────────────────────────────────────
function handleWebSocket(request: Request): Response {
  // Authentication already validated this private offered protocol. Echo it as
  // the selected subprotocol; browsers reject an upgrade when they offered a
  // protocol and the server silently selects none.
  const authProtocol = (request.headers.get('sec-websocket-protocol') || '')
    .split(',').map((value) => value.trim())
    .find((value) => value.startsWith('voipappz-bearer.'));
  const { socket, response } = Deno.upgradeWebSocket(
    request,
    authProtocol ? { protocol: authProtocol } : undefined,
  );
  const url = new URL(request.url);
  const initialTopics = (url.searchParams.get("topics") || "#").split(',').map((s) => s.trim()).filter(Boolean);
  // This user's state stream, bridged through us. The cable authorizes the
  // CONNECTION from the token before any channel exists, so it must be the
  // caller's own login token — one cable connection per browser client, not the
  // startup singletons above. `id` comes from the token's claims where possible;
  // a token that carries no user_uuid falls back to what the client asked for.
  const userToken = requestToken(request);
  const claims = tokenClaims(userToken);
  const stateUserId = claims.user_uuid || url.searchParams.get("state_user") || "";
  const dashboardAccountId = claims.account_uuid || "";
  let userCable: CableClient | null = null;
  // Every per-user stream lands on THIS socket. It must never go through the
  // shared emitEvent fan-out, which broadcasts to all subscribers regardless of
  // who they are — that is how one tenant's data reaches another's browser.
  const sendToClient = (frame: Pojo) => {
    if (!canSendRealtime(socket, WS_MAX_BUFFERED_BYTES)) { websocketBackpressureDropCounter++; return; }
    try { socket.send(JSON.stringify(frame)); } catch { websocketBackpressureDropCounter++; }
  };

  socket.addEventListener("open", () => {
    const sub: Subscriber = { ws: socket, topics: new Set(initialTopics), environmentUuid: claims.environment_uuid || "" };
    subscribers.set(socket, sub);
    socket.send(JSON.stringify({ type: "welcome", ts: new Date().toISOString(), subscribed: [...sub.topics], clients: subscribers.size, cable_ready: cableClient?.ready() ?? false }));

    // ONE cable connection per browser client, authorized by that person's own
    // login token, carrying every stream they are entitled to. ActionCable
    // multiplexes by identifier, so three streams do not need three sockets.
    //
    // A confirmed subscription is also the REGISTRATION: the node stamps
    // user:<uuid>:logged_in_at when the subscribe lands (app.cr), so connecting
    // here is what marks the user online.
    const streams: Array<{ identifier: Pojo; onRaw: (m: unknown) => void }> = [];

    if (stateUserId) {
      // Their own state. A value stream, not a call event — relay the ops
      // untouched and let the browser fold them (CABLE_SPEC §5).
      streams.push({
        identifier: { channel: "StateChannel", scope: "user", id: stateUserId },
        onRaw: (message) => sendToClient({ type: "user.state", user_uuid: stateUserId, message }),
      });
      // Their notifications, pushed. This replaces the browser polling the API
      // on a timer: same server, same data, no interval.
      streams.push({
        identifier: { channel: "Notifications", user_uuid: stateUserId },
        onRaw: (message) => sendToClient({ type: "notification", message }),
      });
    }

    // The live agents/extensions panel. The CONNECTION is this user's, but the
    // panel is tenant-wide, so its stream is keyed by account — taken from the
    // same token's claims, never from configuration.
    if (dashboardAccountId) {
      const relay = createCoalescingRelay<Pojo>(
        (payload) => sendToClient({ type: "dashboard.live", ts: new Date().toISOString(), payload }),
        (pending, next) => ({ ...pending, ...next }),
        DASHBOARD_RELAY_INTERVAL_MS,
      );
      streams.push({
        identifier: { channel: "DashboardLive", account_uuid: dashboardAccountId },
        onRaw: (message) => {
          dashboardFramesReceived++;
          const payload = (message && typeof message === "object") ? message as Pojo : { raw: message };
          if (relay.push(payload)) dashboardFramesCoalesced++;
        },
      });
    }

    if (userToken && streams.length) {
      userCable = createCableClient({
        url: CABLE_URL,
        token: userToken,
        subscriptions: streams,
        maxFrameBytes: CABLE_MAX_FRAME_BYTES,
        log: (m) => console.log(`👤 ${m}`),
      });
    }
  });
  const teardown = () => {
    subscribers.delete(socket);
    // This cable connection exists only for this client — never outlive it.
    userCable?.stop();
    userCable = null;
  };
  socket.addEventListener("close", teardown);
  socket.addEventListener("error", teardown);
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

interface RequestHandlerOptions {
  eventInspectorEnabled?: boolean;
  eventReader?: Pick<EventStore, "page">;
  mcpEnabled?: boolean;
  mcpAuthToken?: string;
  mcpAllowLocalhostWithoutToken?: boolean;
  mcpReader?: DuckDbMcpReader;
}

interface RequestConnectionInfo {
  remoteAddr?: { hostname?: string };
}

function isLoopbackConnection(info?: RequestConnectionInfo): boolean {
  const hostname = info?.remoteAddr?.hostname?.toLowerCase() ?? "";
  return hostname.startsWith("127.") || hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1" || hostname.startsWith("::ffff:127.");
}

export function createRequestHandler(jwtVerifier?: JwtVerifier, options: RequestHandlerOptions = {}) {
  const verifyJwt = jwtVerifier || createJwtVerifier();
  const eventInspectorEnabled = options.eventInspectorEnabled ?? EVENT_INSPECTOR_ENABLED;
  const eventReader = options.eventReader ?? eventStore;
  const mcpEnabled = options.mcpEnabled ?? MCP_ENABLED;
  const mcpAuthToken = options.mcpAuthToken ?? MCP_AUTH_TOKEN;
  const mcpAllowLocalhostWithoutToken = options.mcpAllowLocalhostWithoutToken ??
    MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN;
  const mcpHandler = createDuckDbMcpHandler(options.mcpReader ?? eventStore, {
    authToken: mcpAuthToken,
  });
  return async (request: Request, connectionInfo?: RequestConnectionInfo): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    // (forwarded prefixes are matched at the bottom, after deno's own routes)

    // Read-only MCP Streamable HTTP endpoint over local DuckDB only. A separate
    // opt-in flag and bearer token protect raw tenant event payloads.
    if (url.pathname === "/mcp") {
      if (!mcpEnabled) {
        return new Response(JSON.stringify({ error: "DuckDB MCP disabled" }), { status: 404, headers: JSON_HEADERS });
      }
      const localWithoutToken = mcpAllowLocalhostWithoutToken && isLoopbackConnection(connectionInfo);
      if (!mcpAuthToken && mcpAllowLocalhostWithoutToken && !localWithoutToken) {
        return new Response(JSON.stringify({ error: "DuckDB MCP is localhost-only without a token" }), {
          status: 403,
          headers: JSON_HEADERS,
        });
      }
      return mcpHandler(request, { allowUnauthenticated: localWithoutToken });
    }

    // ── Optional PostgREST connector login ───────────────────────────────
    // Proxies to PostgREST's users-backed `api.login` RPC and returns the
    // signed JWT (role api_readonly + user_uuid/environment_uuid claims). The
    // browser stores it and sends it back as the bearer on every request. This
    // replaces Supabase Auth: one user login, one token, single source. The
    // environment_uuid claim scopes api.calls to the user's environment.
    // This is deliberately outside /auth/*: that namespace belongs entirely
    // to the mothership user login/OTP flow used by this end-user app.
    if (request.method === "POST" && url.pathname === "/connectors/postgrest/auth/login") {
      let creds: { email?: string; password?: string } = {};
      try { creds = await request.json(); } catch { /* bad body → handled below */ }
      if (!creds.email || !creds.password) {
        return new Response(JSON.stringify({ error: "email and password are required" }), { status: 400, headers: JSON_HEADERS });
      }
      if (!POSTGREST_ENABLED) {
        return new Response(JSON.stringify({ error: "postgrest not configured" }), { status: 503, headers: JSON_HEADERS });
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

    if (url.pathname === "/ws/events" && request.headers.get("upgrade") === "websocket") {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated) {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      if (subscribers.size >= WS_MAX_CLIENTS) {
        return new Response(JSON.stringify({ error: "realtime client limit reached" }), {
          status: 503,
          headers: JSON_HEADERS,
        });
      }
      return handleWebSocket(request);
    }

    // Functional event-pipeline test. It is unreachable unless explicitly
    // enabled, and uses the exact JSON-text shape published by va-crystal.
    if (request.method === "POST" && url.pathname === "/test/crystal/events") {
      if (!MOCK_CRYSTAL_EVENTS) {
        return new Response(JSON.stringify({ error: "Crystal event mock disabled" }), { status: 404, headers: JSON_HEADERS });
      }
      let options: { call_id?: string; direction?: "inbound" | "outbound"; from?: string; to?: string } = {};
      try { options = await request.json(); } catch { /* empty body uses defaults */ }
      const rawEvents = mockCrystalCallSequence({
        callId: options.call_id,
        direction: options.direction,
        from: options.from,
        to: options.to,
      });
      let accepted = 0;
      for (const raw of rawEvents) {
        // Mirror the real frame: Cable message is event_record_json text.
        const normalized = normalizeCableEvent(JSON.stringify(raw));
        if (normalized && await consumeCallEvent(normalized)) accepted++;
      }
      return new Response(JSON.stringify({
        status: accepted === rawEvents.length ? "ok" : "partial",
        call_id: rawEvents[0].type_uuid,
        generated: rawEvents.length,
        accepted,
        counters: { tapped: tappedCounter, persisted: persistedCounter, duplicates: duplicateCounter, persistence_failures: persistenceFailureCounter },
      }), { status: accepted === rawEvents.length ? 201 : 503, headers: JSON_HEADERS });
    }

    // Functional NATS-pipeline test. This uses the exact va-crystal payload
    // contracts, but never opens a broker connection; production NATS wiring
    // will call the same normalizeNatsMessage → consumeCallEvent path.
    if (request.method === "POST" && url.pathname === "/test/nats/events") {
      if (!MOCK_CRYSTAL_EVENTS) {
        return new Response(JSON.stringify({ error: "NATS event mock disabled" }), { status: 404, headers: JSON_HEADERS });
      }
      let body: { subject?: string; message?: unknown } = {};
      try { body = await request.json(); } catch { /* malformed body handled below */ }
      const subject = String(body.subject || "");
      const normalized = normalizeNatsMessage(subject, body.message);
      if (normalized.length === 0) {
        return new Response(JSON.stringify({ error: "no valid NATS events", subject }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }
      let accepted = 0;
      for (const event of normalized) if (await consumeCallEvent(event)) accepted++;
      return new Response(JSON.stringify({
        status: accepted === normalized.length ? "ok" : "partial",
        subject,
        generated: normalized.length,
        accepted,
        counters: { tapped: tappedCounter, persisted: persistedCounter, duplicates: duplicateCounter, persistence_failures: persistenceFailureCounter },
      }), { status: accepted === normalized.length ? 201 : 503, headers: JSON_HEADERS });
    }

    // Dashboard-only projection over consumed va-crystal events. There is no
    // generic local Calls/Reports API: those modules remain on the mothership.
    if (request.method === "GET" && url.pathname === "/dashboard/snapshot") {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = Number(url.searchParams.get("from") || now - 86400);
        const to = Number(url.searchParams.get("to") || now);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
          return new Response(JSON.stringify({ error: "invalid dashboard time range" }), { status: 400, headers: JSON_HEADERS });
        }
        return new Response(JSON.stringify(await eventStore.dashboardSnapshot(from, to)), { status: 200, headers: JSON_HEADERS });
      } catch (err) {
        console.error("dashboard event projection failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "event store unavailable" }), { status: 503, headers: JSON_HEADERS });
      }
    }

    // Builder data explorer. Unlike the opt-in operational /events inspector,
    // this authenticated dashboard view returns only the normalized projection
    // (never raw_payload) and is always available to the dashboard feature.
    if (request.method === "GET" && url.pathname === "/dashboard/events") {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      const requestedLimit = Number(url.searchParams.get("limit") || 50);
      const requestedOffset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isInteger(requestedLimit) || !Number.isInteger(requestedOffset) || requestedLimit < 1 || requestedOffset < 0) {
        return new Response(JSON.stringify({ error: "invalid dashboard event page" }), { status: 400, headers: JSON_HEADERS });
      }
      const filters = {
        q: url.searchParams.get("q")?.trim() || undefined,
        eventType: url.searchParams.get("event_type")?.trim() || undefined,
        action: url.searchParams.get("action")?.trim() || undefined,
        callId: url.searchParams.get("call_id")?.trim() || undefined,
      };
      if (Object.values(filters).some((value) => value && value.length > 200)) {
        return new Response(JSON.stringify({ error: "event filter too long" }), { status: 400, headers: JSON_HEADERS });
      }
      try {
        const page = await eventReader.page({
          limit: Math.min(250, requestedLimit), offset: requestedOffset, ...filters,
        });
        const events = page.events.map((event) => ({
          event_id: event.event_id,
          call_id: event.call_id,
          event_type: event.event_type,
          action: event.action,
          occurred_at: event.occurred_at,
          occurred_at_epoch: event.occurred_at_epoch,
          received_at: event.received_at,
          payload: event.payload,
        }));
        return new Response(JSON.stringify({
          events, total: page.total, limit: Math.min(250, requestedLimit), offset: requestedOffset,
        }), { status: 200, headers: JSON_HEADERS });
      } catch (err) {
        console.error("dashboard event view failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "event store unavailable" }), { status: 503, headers: JSON_HEADERS });
      }
    }

    // Read-only operational view over the rows actually stored in DuckDB.
    // Explicitly opt-in because payloads may include tenant call metadata.
    if (request.method === "GET" && url.pathname === "/events") {
      if (!eventInspectorEnabled) {
        return new Response(JSON.stringify({ error: "event inspector disabled" }), { status: 404, headers: JSON_HEADERS });
      }
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      const requestedLimit = Number(url.searchParams.get("limit") || 25);
      const requestedOffset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isInteger(requestedLimit) || !Number.isInteger(requestedOffset) || requestedLimit < 1 || requestedOffset < 0) {
        return new Response(JSON.stringify({ error: "invalid event page" }), { status: 400, headers: JSON_HEADERS });
      }
      const limit = Math.min(1000, requestedLimit);
      const offset = requestedOffset;
      const filters = {
        q: url.searchParams.get("q")?.trim() || undefined,
        eventType: url.searchParams.get("event_type")?.trim() || undefined,
        action: url.searchParams.get("action")?.trim() || undefined,
        callId: url.searchParams.get("call_id")?.trim() || undefined,
      };
      if (Object.values(filters).some((value) => value && value.length > 200)) {
        return new Response(JSON.stringify({ error: "event filter too long" }), { status: 400, headers: JSON_HEADERS });
      }
      try {
        const page = await eventReader.page({ limit, offset, ...filters });
        return new Response(JSON.stringify({ ...page, limit, offset }), {
          status: 200,
          headers: JSON_HEADERS,
        });
      } catch (err) {
        console.error("event inspector failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "event store unavailable" }), { status: 503, headers: JSON_HEADERS });
      }
    }

    // Dashboard collection CRUD. This is the missing top level from Nimbus's
    // builder: users can create/select dashboards, then edit their widgets.
    if (url.pathname === "/dashboard/dashboards" || url.pathname.startsWith("/dashboard/dashboards/")) {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      const dashboardId = url.pathname === "/dashboard/dashboards"
        ? null
        : decodeURIComponent(url.pathname.slice("/dashboard/dashboards/".length));
      try {
        if (request.method === "GET" && !dashboardId) {
          return new Response(JSON.stringify({ dashboards: await eventStore.listDashboards() }), { status: 200, headers: JSON_HEADERS });
        }
        if ((request.method === "POST" && !dashboardId) || (request.method === "PATCH" && dashboardId)) {
          let body: Record<string, unknown> = {};
          try { body = await request.json(); } catch { /* validation below */ }
          const name = typeof body.name === "string" ? body.name.trim() : "";
          if (!name) return new Response(JSON.stringify({ error: "dashboard name is required" }), { status: 400, headers: JSON_HEADERS });
          const dashboards = await eventStore.listDashboards();
          const current = dashboardId ? dashboards.find((item) => item.uuid === dashboardId) : null;
          if (dashboardId && !current) return new Response(JSON.stringify({ error: "dashboard not found" }), { status: 404, headers: JSON_HEADERS });
          const dashboard = await eventStore.saveDashboard({
            uuid: dashboardId || crypto.randomUUID(),
            name,
            position: current?.position ?? dashboards.length,
          } as DashboardDefinition);
          return new Response(JSON.stringify(dashboard), { status: dashboardId ? 200 : 201, headers: JSON_HEADERS });
        }
        if (request.method === "DELETE" && dashboardId) {
          if (dashboardId === "default") {
            return new Response(JSON.stringify({ error: "default dashboard cannot be deleted" }), { status: 409, headers: JSON_HEADERS });
          }
          const deleted = await eventStore.deleteDashboard(dashboardId);
          return new Response(JSON.stringify({ deleted }), { status: deleted ? 200 : 404, headers: JSON_HEADERS });
        }
        return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: JSON_HEADERS });
      } catch (err) {
        console.error("dashboard store failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "dashboard store unavailable" }), { status: 503, headers: JSON_HEADERS });
      }
    }

    // Dashboard widget DEFINITIONS (the builder) — stored in the same local
    // DuckDB as the events they visualize. No mothership involvement.
    if (url.pathname === "/dashboard/widgets" || url.pathname.startsWith("/dashboard/widgets/")) {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      const widgetId = url.pathname === "/dashboard/widgets" ? null : decodeURIComponent(url.pathname.slice("/dashboard/widgets/".length));
      const dashboardUuid = url.searchParams.get("dashboard_uuid")?.trim() || "default";
      try {
        if (request.method === "GET" && !widgetId) {
          return new Response(JSON.stringify({ widgets: await eventStore.listWidgets(dashboardUuid) }), { status: 200, headers: JSON_HEADERS });
        }
        if ((request.method === "POST" && !widgetId) || (request.method === "PATCH" && widgetId)) {
          let body: Record<string, unknown> = {};
          try { body = await request.json(); } catch { /* empty body → defaults */ }
          if (request.method === "PATCH") {
            const current = (await eventStore.listWidgets(dashboardUuid)).find((w) => w.uuid === widgetId);
            if (!current) return new Response(JSON.stringify({ error: "widget not found" }), { status: 404, headers: JSON_HEADERS });
            body = { ...current, ...body };
          }
          const widget = await eventStore.saveWidget({
            title: "", type: "counter", metric: "total", position: Date.now() % 1_000_000,
            dashboard_uuid: dashboardUuid,
            ...body,
            uuid: widgetId || crypto.randomUUID(),
          } as WidgetDefinition);
          return new Response(JSON.stringify(widget), { status: widgetId ? 200 : 201, headers: JSON_HEADERS });
        }
        if (request.method === "DELETE" && widgetId) {
          const deleted = await eventStore.deleteWidget(widgetId);
          return new Response(JSON.stringify({ deleted }), { status: deleted ? 200 : 404, headers: JSON_HEADERS });
        }
        return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: JSON_HEADERS });
      } catch (err) {
        console.error("widget store failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "widget store unavailable" }), { status: 503, headers: JSON_HEADERS });
      }
    }

    // Optional analytics connector. The current Dashboard uses the
    // DuckDB snapshot above; this route remains for tenant-specific consumers.
    if (request.method === "GET" && url.pathname === "/dashboard/calls-per-hour") {
      const authResult = await verifyJwt(request);
      if (!authResult.authenticated && authResult.error !== "Auth not configured") {
        return unauthorizedResponse(authResult.error || "Unauthorized", CORS_HEADERS);
      }
      if (!INFLUX_ENABLED) {
        return new Response(JSON.stringify({ error: "influxdb not configured", points: [] }), { status: 503, headers: JSON_HEADERS });
      }
      const minutes = parseInt(url.searchParams.get("minutes") || "1440");
      const environmentUuids = url.searchParams.getAll("env").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
      try {
        return new Response(JSON.stringify({ points: await dashboardCallsPerHour({ minutes, environmentUuids }) }), { status: 200, headers: JSON_HEADERS });
      } catch (err) {
        console.error("optional influx connector failed:", err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "influxdb upstream unavailable", points: [] }), { status: 502, headers: JSON_HEADERS });
      }
    }

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

    if (url.pathname === "/health/live") {
      return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), { status: 200, headers: JSON_HEADERS });
    }

    if (url.pathname === "/health/ready") {
      const report = await checkHealth();
      return new Response(JSON.stringify(report), { status: report.ready ? 200 : 503, headers: JSON_HEADERS });
    }

    // Health probe (cable + events freshness + engine). Used by Kamal's
    // container healthcheck — returns 503 when any required dep is down.
    if (url.pathname === "/health") {
      const report = await checkHealth();
      return new Response(JSON.stringify(report), {
        status: report.healthy ? 200 : 503,
        headers: JSON_HEADERS,
      });
    }

    if (url.pathname === "/test") {
      const fresh = eventFreshness(lastCallEventAt, Date.now(), EVENTS_STALE_SECONDS, (CABLE_ENABLED && !cableClient?.disabled()) || NATS_ENABLED || MOCK_CRYSTAL_EVENTS);
      return new Response(JSON.stringify({
        status: "ok", template: "voipappz",
        cable_ready: cableClient?.ready() ?? false, cable_url: CABLE_URL, cable_channel: CABLE_CHANNEL,
        ws_clients: subscribers.size, relayed: relayedCounter, tapped: tappedCounter,
        persisted: persistedCounter, duplicates: duplicateCounter, persistence_failures: persistenceFailureCounter,
        websocket_backpressure_drops: websocketBackpressureDropCounter,
        websocket_oversized_drops: websocketOversizedDropCounter,
        dashboard_frames_received: dashboardFramesReceived,
        dashboard_frames_coalesced: dashboardFramesCoalesced,
        last_event_at: fresh.last_event_at, seconds_since_last_event: fresh.age_seconds, events_status: fresh.status,
        engine: ENGINE_ENABLED, timestamp: new Date().toISOString(),
      }), { status: 200, headers: JSON_HEADERS });
    }

    // ── Mothership forwarder — /api/*, /auth/*, /tasks/* → ENGINE_URL ─────
    // The browser only ever talks same-origin: data reads (/api/...), the user
    // login/OTP surface (/auth/user_login, /auth/user/otp/verify), and the
    // public portal branding (/tasks/customer_portal_data) all ride through
    // here, so no mothership URL is ever baked into the bundle. The client's
    // own Authorization header passes through untouched; deno adds nothing.
    // (the optional connector login is handled above and never forwarded.)
    if (MOTHERSHIP_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return forwardToMothership(request, url);
    }

    // Optional PostgREST data plane — /rest/v1/* (503 when not configured).
    if (url.pathname.startsWith("/rest/v1/")) {
      return forwardToPostgrest(request, url);
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
  console.log(`🧠 Dashboard → local DuckDB; calls/reports/auth → MOTHERSHIP_URL; transcript engine auth → ${ENGINE_ENABLED ? "on" : "off"}`);

  // Live cable subscription (explicit endpoint or cable auth) → relayed to /ws
  // for the Dashboard. Unavailable endpoints disable after bounded retries.
  if (CABLE_ENABLED) {
    void startCableClient().catch((err) => {
      console.error("cable/event-store startup failed:", err instanceof Error ? err.message : err);
    });
  }
  else console.log(`🔇 cable tap disabled (set CABLE_URL or cable auth) — relay idle`);
  if (NATS_ENABLED) {
    void startNatsClient().catch((err) => {
      console.error("nats/event-store startup failed:", err instanceof Error ? err.message : err);
    });
  } else console.log(`🔇 nats consumer disabled (set NATS_URL)`);
  if (MOCK_CRYSTAL_EVENTS) console.log("🧪 Crystal event mock enabled → POST /test/crystal/events");
  if (MCP_ENABLED && MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN) {
    console.log("🔎 DuckDB MCP enabled → POST /mcp (read-only, localhost direct + bearer beyond localhost)");
  } else if (MCP_ENABLED && MCP_AUTH_TOKEN) {
    console.log("🔎 DuckDB MCP enabled → POST /mcp (read-only, bearer protected)");
  } else if (MCP_ENABLED) {
    console.warn("⚠️ MCP_ENABLED=1 but MCP_AUTH_TOKEN is empty — /mcp will remain unavailable");
  }

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
