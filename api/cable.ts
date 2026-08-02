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
// Auth: the cable connection authenticates with an HS256 JWT passed as
// `?token=`, carrying an `account_uuid` claim, signed with the cable's
// SECRET_KEY (see va-crystal/va-shared/src/cable_auth.cr). No expiry is checked,
// so a backend service can mint one long-lived token.

type Pojo = Record<string, any>;

// ── JWT minting (HS256) ─────────────────────────────────────────────────
const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Mint an HS256 JWT { account_uuid } signed with `secret` — the exact shape
// VaShared::CableAuth.decode_jwt expects (alg HS256, account_uuid claim).
export async function mintCableToken(secret: string, accountUuid: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({ account_uuid: accountUuid })));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

// ── Normalize a cable broadcast into our canonical event ────────────────
// Cable payload (event_record_json):
//   { type:"call", type_uuid:<call_uuid>, action:"number.answer"|"user.answer"|…,
//     created_at:"<unix seconds>", user_uuid?, metadata:{ caller_id_number, … } }
export interface Normalized {
  wsType: string;
  wsPayload: Pojo;
  occurredAtIso?: string;
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
  log?: (m: string) => void;
  reconnectMs?: number;
  socketFactory?: (url: string, protocol: string) => WebSocketLike; // DI for tests
}

export interface CableClient { stop(): void; ready(): boolean; }

export function createCableClient(opts: CableClientOpts): CableClient {
  const channel = opts.channel ?? "CallEvents";
  const identifier = JSON.stringify(opts.identifier ?? { channel });
  const log = opts.log ?? (() => {});
  const reconnectMs = opts.reconnectMs ?? 3000;
  const factory = opts.socketFactory ?? ((u, p) => new WebSocket(u, p) as unknown as WebSocketLike);
  let ws: WebSocketLike | null = null;
  let ready = false;
  let stopped = false;

  function connect() {
    if (stopped) return;
    const u = opts.token ? `${opts.url}?token=${encodeURIComponent(opts.token)}` : opts.url;
    ws = factory(u, "actioncable-v1-json");
    ws.addEventListener("open", () => log(`cable ws open → ${opts.url}`));
    ws.addEventListener("message", (ev: any) => { void onFrame(ev?.data); });
    ws.addEventListener("close", () => { ready = false; if (!stopped) setTimeout(connect, reconnectMs); });
    ws.addEventListener("error", () => { /* close handler schedules reconnect */ });
  }

  async function onFrame(data: unknown) {
    let frame: any;
    try { frame = JSON.parse(typeof data === "string" ? data : ""); } catch { return; }
    switch (frame?.type) {
      case "welcome":
        ws?.send(JSON.stringify({ command: "subscribe", identifier }));
        return;
      case "confirm_subscription":
        ready = true; log(`cable subscribed → ${identifier}`);
        return;
      case "reject_subscription":
        ready = false; log(`cable REJECTED → ${identifier} (check JWT/account)`);
        return;
      case "ping":
      case "disconnect":
        return;
    }
    // Data frame: { identifier, message }.
    if (frame && frame.message !== undefined) {
      // Raw path (DashboardLive): hand the broadcast through untouched.
      if (opts.onRaw) { await opts.onRaw(frame.message); return; }
      // Default path: message is a baked call event → normalize + emit.
      const n = normalizeCableEvent(frame.message);
      if (n) await opts.onEvent?.(n);
    }
  }

  connect();
  return {
    stop() { stopped = true; ready = false; try { ws?.close(); } catch { /* ignore */ } },
    ready: () => ready,
  };
}
