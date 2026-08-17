// ActionCable WebSocket *client* — subscribes to the va-crystal cable server's
// `CallEvents` channel and feeds each broadcast call event into the same emit
// path the rest of the API uses (DuckDB event store + /ws/events fanout).
//
// This replaces the old direct broker tap: instead of consuming raw FreeSWITCH
// events off LavinMQ, we subscribe to cable — which already normalizes events
// (groups by va_call_uuid, applies the call_types allow-list) and broadcasts
// the baked `event_record_json` to the `call_events` stream. We never touch
// Redis/AMQP directly; we speak the ActionCable WS protocol.
//
// Auth: the connection authenticates with a `?token=` the node verifies against
// its own SECRET_KEY (va-crystal node/realtime/app.cr). It accepts a mothership
// USER token — `user_uuid` is a valid identity claim — so callers pass the login
// token they already hold. This client never mints one: doing so required
// sharing the node's secret, which is exactly the coupling we do not want.

type Pojo = Record<string, any>;

const enc = new TextEncoder();

// ── Normalize a cable broadcast into our canonical event ────────────────
// Cable payload (event_record_json):
//   { type:"call", type_uuid:<call_uuid>, action:"number.answer"|"user.answer"|…,
//     created_at:"<unix seconds>", user_uuid?, metadata:{ caller_id_number, … } }
export interface Normalized {
  wsType: string;
  wsPayload: Pojo;
  occurredAtIso?: string;
  /** Stable producer identity. Mature EventCdr envelopes supply this directly. */
  sourceEventId?: string;
  /** Original va-crystal event, retained for lossless local persistence. */
  raw?: Pojo;
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));

// number.<verb> call-leg actions → our call.* status vocabulary. Anything not
// mapped passes through as call.<verb> so no state is silently dropped.
const NUMBER_STATE: Record<string, string> = {
  originate: "ringing", ringing: "ringing", answer: "answered",
  hangup: "completed", complete: "completed",
};

export function normalizeCableEvent(message: unknown): Normalized | null {
  // va-crystal publishes `event_record_json` directly to Cable. That value is
  // already JSON text, so depending on the Cable backend the ActionCable
  // frame's `message` can be either the decoded object or that JSON string.
  // Accept both shapes; the latter is what the real NATS-backed path emits.
  let decoded = message;
  if (typeof decoded === "string") {
    try { decoded = JSON.parse(decoded); } catch { return null; }
  }
  const m = (decoded && typeof decoded === "object" && !Array.isArray(decoded)) ? decoded as Pojo : null;
  if (!m) return null;
  const action = String(m.action ?? "");
  if (!action) return null;
  const md: Pojo = (m.metadata && typeof m.metadata === "object") ? m.metadata : {};
  const call_id = str(m.type_uuid) ?? str(md.call_uuid);

  // created_at is unix seconds (string); fall back to ingest time if absent.
  const sec = parseInt(String(m.created_at ?? ""), 10);
  const occurredAtIso = Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : undefined;

  const base: Pojo = {
    call_id,
    channel_uuid: str(md.channel_uuid),
    from: str(md.caller_id_number) ?? str(md.user_from),
    to: str(md.user_to),
    direction: str(md.call_type),
    user_uuid: str(m.user_uuid) ?? str(md.user_uuid),
    environment_uuid: str(md.environment_uuid),
    queue_name: str(md.queue_name),
    action,
  };

  if (action.startsWith("number.")) {
    const verb = action.slice("number.".length);
    const state = NUMBER_STATE[verb] ?? verb;
    return { wsType: `call.${state}`, wsPayload: { ...base, state }, occurredAtIso, raw: m };
  }

  // transcribe.* — transcripts produced by the mothership's workflow (Roast
  // cogs publish onto the cable's call_events stream). Map onto the canonical
  // transcription.* vocabulary so store.transcript()/the UI need no changes.
  if (action.startsWith("transcribe.")) {
    const verb = action.slice("transcribe.".length); // done | error | queued | processing
    if (verb === "done") {
      const text = str(md.transcript) ?? "";
      // The chat cog returns {"summary","segments":[{speaker,text}]} as JSON.
      let segments: unknown[] = [];
      let summary: string | null = null;
      try {
        const ai = JSON.parse(String(md.ai ?? ""));
        if (Array.isArray(ai?.segments)) segments = ai.segments;
        summary = str(ai?.summary);
      } catch { /* ai is optional — fall back to one raw-text segment */ }
      if (!segments.length && text) segments = [{ speaker: "A", text }];
      return {
        wsType: "transcription.completed",
        wsPayload: { call_id, language: str(md.language), text, segments, summary, confidence: null },
        occurredAtIso,
        raw: m,
      };
    }
    if (verb === "error") {
      return { wsType: "transcription.failed", wsPayload: { call_id, error: str(md.error) ?? "unknown" }, occurredAtIso, raw: m };
    }
    return { wsType: `transcription.${verb}`, wsPayload: { call_id }, occurredAtIso, raw: m };
  }

  // user.* / queue.* (agent/queue lifecycle) — keep under their own type so the
  // event store records them; calls_view only projects call.* rows.
  return { wsType: action, wsPayload: base, occurredAtIso, raw: m };
}

// ── ActionCable client ──────────────────────────────────────────────────
// Minimal WebSocketLike so tests can inject a fake socket (no real network).
export interface WebSocketLike {
  addEventListener(type: string, cb: (ev: any) => void): void;
  send(data: string): void;
  close(): void;
}

export interface CableClientOpts {
  url: string;                                   // ws://host:4000/cable (va-crystal)
  token: string;                                 // HS256 JWT (?token=)
  channel?: string;                              // default "CallEvents"
  // Full ActionCable identifier override. CallEvents needs only {channel};
  // DashboardLive needs {channel, account_uuid, Live_uuid}. When set, it
  // takes precedence over `channel`.
  identifier?: Pojo;
  // Default path: normalize each broadcast into a canonical call event.
  onEvent?: (n: Normalized) => void | Promise<void>;
  // Raw path (DashboardLive): receive the untouched broadcast `message`
  // (the dashboard is a value stream, not a call event — skip normalization).
  onRaw?: (message: unknown) => void | Promise<void>;
  // Several streams on ONE connection. ActionCable multiplexes by identifier,
  // so a browser client that wants its state, its dashboard and its
  // notifications needs one socket and three subscribes — not three sockets.
  // Takes precedence over `identifier`/`channel` when non-empty.
  subscriptions?: Array<{ identifier: Pojo; onRaw: (message: unknown) => void | Promise<void> }>;
  log?: (m: string) => void;
  reconnectMs?: number;
  /** Reject oversized ActionCable frames before JSON parsing. */
  maxFrameBytes?: number;
  /** Stop reconnecting after this many failed retries. */
  maxReconnectAttempts?: number;
  socketFactory?: (url: string, protocol: string) => WebSocketLike; // DI for tests
}

export interface CableClient { stop(): void; ready(): boolean; disabled(): boolean; }

export function createCableClient(opts: CableClientOpts): CableClient {
  const channel = opts.channel ?? "CallEvents";
  // The identifier STRING is the subscription's identity: the server echoes it
  // back verbatim on every frame, so routing must compare the exact string we
  // sent, key order and all (CABLE_SPEC §2).
  const routes = new Map<string, (message: unknown) => void | Promise<void>>();
  for (const sub of opts.subscriptions ?? []) {
    routes.set(JSON.stringify(sub.identifier), sub.onRaw);
  }
  const identifiers = routes.size
    ? [...routes.keys()]
    : [JSON.stringify(opts.identifier ?? { channel })];
  const identifier = identifiers[0];
  const log = opts.log ?? (() => {});
  const reconnectMs = opts.reconnectMs ?? 3000;
  const maxReconnectAttempts = opts.maxReconnectAttempts ?? 5;
  const maxFrameBytes = opts.maxFrameBytes ?? 2_097_152;
  const factory = opts.socketFactory ?? ((u, p) => new WebSocket(u, p) as unknown as WebSocketLike);
  let ws: WebSocketLike | null = null;
  let ready = false;
  let stopped = false;
  let disabled = false;
  let welcomed = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleReconnect() {
    ready = false;
    if (stopped || disabled) return;
    if (reconnectAttempts >= maxReconnectAttempts) {
      disabled = true;
      log(`cable disabled — unavailable after ${maxReconnectAttempts} retries`);
      return;
    }
    reconnectAttempts++;
    log(`cable reconnect ${reconnectAttempts}/${maxReconnectAttempts} in ${reconnectMs}ms`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
  }

  function connect() {
    if (stopped || disabled) return;
    const u = opts.token ? `${opts.url}?token=${encodeURIComponent(opts.token)}` : opts.url;
    let failed = false;
    // ActionCable greets an ACCEPTED connection with `welcome`. A server that
    // rejects one (reject_unauthorized_connection) instead closes straight away
    // — code 1000, reason "Farewell", no welcome. Both look identical to a dead
    // network from here, so track the greeting: closing before it means our
    // connect params/auth were refused, and retrying cannot help. Say so once,
    // rather than burning the retry budget silently.
    welcomed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      if (!welcomed) {
        log(`cable connection refused — closed before welcome (check connect params/auth for ${opts.url})`);
      }
      scheduleReconnect();
    };
    try {
      ws = factory(u, "actioncable-v1-json");
    } catch (error) {
      log(`cable connection failed — ${error instanceof Error ? error.message : String(error)}`);
      fail();
      return;
    }
    ws.addEventListener("open", () => log(`cable ws open → ${opts.url}`));
    ws.addEventListener("message", (ev: any) => { void onFrame(ev?.data); });
    ws.addEventListener("close", fail);
    ws.addEventListener("error", () => {
      try { ws?.close(); } catch { /* close/fail below owns the retry */ }
      fail();
    });
  }

  async function onFrame(data: unknown) {
    if (typeof data !== "string") return;
    if (enc.encode(data).byteLength > maxFrameBytes) {
      log(`cable frame dropped — exceeds ${maxFrameBytes} bytes`);
      return;
    }
    let frame: any;
    try { frame = JSON.parse(data); } catch { return; }
    switch (frame?.type) {
      case "welcome":
        welcomed = true;
        for (const id of identifiers) ws?.send(JSON.stringify({ command: "subscribe", identifier: id }));
        return;
      case "confirm_subscription":
        // On this cable a confirmed subscription is also the REGISTRATION: the
        // node stamps user:<uuid>:logged_in_at when it lands. Log which one, so
        // a partially-registered connection is visible rather than implied.
        ready = true; reconnectAttempts = 0;
        log(`cable subscribed → ${frame.identifier ?? identifier}`);
        return;
      case "reject_subscription":
        ready = false; disabled = true;
        log(`cable disabled — subscription rejected → ${frame.identifier ?? identifier} (check channel/params)`);
        try { ws?.close(); } catch { /* already closed */ }
        return;
      case "ping":
      case "disconnect":
        return;
    }
    // Data frame: { identifier, message }.
    if (frame && frame.message !== undefined) {
      // Multiplexed: route by the identifier the server echoed back.
      const route = routes.get(String(frame.identifier));
      if (route) { await route(frame.message); return; }
      if (routes.size) return;   // multiplexed client: an unknown stream is not ours
      // Raw path (DashboardLive): hand the broadcast through untouched.
      if (opts.onRaw) { await opts.onRaw(frame.message); return; }
      // Default path: message is a baked call event → normalize + emit.
      const n = normalizeCableEvent(frame.message);
      if (n) await opts.onEvent?.(n);
    }
  }

  connect();
  return {
    stop() {
      stopped = true; ready = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      try { ws?.close(); } catch { /* ignore */ }
    },
    ready: () => ready,
    disabled: () => disabled,
  };
}
