# Architecture — VoIPAppz portal

A React 19 + Vite admin portal for VoIP/telecom tenants, built as reusable
components over **one backend: the voipappz-api "mothership"**. A tenant fork
changes **env, not code**.

## The one rule: same-origin, always

The browser never carries a backend host — every client builds **relative
URLs**. The app server in front owns the actual upstream:

```
                    dev                                prod (single container, Kamal)
  Browser ──► Vite :4200 ─┬─ /api, /auth/*, /tasks ──►  Browser ──► deno-api ─┬─ /api, /auth/*, /tasks ──► MOTHERSHIP_URL
              (proxy)     │        (mothership)                    (serves     │        (mothership)
                          └─ /dashboard/*, /events, /ws ─► deno-api  dist/)    ├─ /ws/events (event relay)
                                                                                └─ /dashboard/*, /calls/*/transcript
```

`VITE_MOTHERSHIP_URL` exists only as a **direct-mode escape hatch** for
static-only hosting (e.g. the Fireberry embed) where no app server fronts the
bundle.

## Pieces

| Piece | Where | Role |
|---|---|---|
| React app | `src/` (Vite :4200) | UI. Strict data-access layering: `lib/auth.ts` (the one credential) → `lib/clients/` (transport) → `services/` (per-feature) → `components/` (folder-per-component; `Calls` is the blueprint). |
| deno-api | `api/` (:4001, entry `app.ts` → `server.ts`) | Thin BFF: mothership forwarder, Core-NATS CDR ingestion/replay, `/ws/events`, Dashboard-only DuckDB projections, engine-backed transcript reads, health probes, the opt-in `/events` inspector, and read-only DuckDB MCP for development. Serves `dist/` in prod. |
| Mothership (voipappz-api) | external, env-pointed | Accounts + login (`/auth/user_login` + optional per-customer OTP), calls, reports, feature flags, portal branding. The source of truth. |
| PostgREST | external, **optional** | A second, direct-SQL data plane (`/rest/v1/*`) for tenant-custom tables/views — see below. |
| Core NATS | external, optional | Current `cdr.write.bulk` batches feed both the API EventCdr writer and Deno's raw-event store. Optional `events.cdr` deployments add committed IDs and replay. One connection, no JetStream. |
| Cable (va-crystal) | external, optional | `DashboardLive` agent/extension values, plus the legacy CallEvents fallback when Core-NATS CDR ingestion is disabled. |

## Event pipeline and readiness

```text
FreeSWITCH CHANNEL_HANGUP_COMPLETE
       ▼
va-crystal {call_uuid,data,metadata}[] ─► Core NATS cdr.write.bulk
                                             ├─► voipappz-api → EventCdr
                                             └─► Deno normalize → DuckDB events
                                                                    ├─ Dashboard snapshot
                                                                    ├─ GET /events → /event-explorer
                                                                    ├─ POST /mcp → developer tools
                                                                    └─ /ws/events relay

Optional committed-event mode:
voipappz-api RubyEventStore ── events.cdr ───────► Deno → DuckDB
                           ◄── events.cdr.replay ─ Deno
```

The default `NATS_CDR_SUBJECTS=cdr.write.bulk` mirrors the system's real insert
input. The untouched row is stored as `raw_payload`; a stable SHA-256 of that
row is its DuckDB idempotency key. When `events.cdr` is selected, the committed
producer `event_id` becomes the key and replay pages plus their cursor commit in
one transaction. `/health/live` only proves the process is serving;
`/health/ready` requires NATS and, only in committed-event mode, caught-up
replay. `/health` stays liveness-compatible so a broker outage preserves
diagnostics.

Do not normally subscribe to both contracts: they describe the same CDR and
have different identifiers. A comma-separated subject list exists for a
controlled migration and for CI, which deliberately proves both paths.

The `/status` screen also reads the mothership's existing
`GET /api/events?event_type=EventCdr` endpoint. That is a separate,
tenant-authenticated diagnostic panel: its rows are never inserted into DuckDB
and never satisfy NATS readiness. The current sibling `voipappz-api` checkout
does not implement the `events.cdr` publisher or `events.cdr.replay` responder,
so production uses `cdr.write.bulk` unless those optional capabilities are
added. The Raw events screen reads DuckDB only and never merges these API rows.

The optional Streamable HTTP MCP endpoint at `POST /mcp` is another read-only
view of the same `EventStore`. Its injected interface contains only `page`,
`dashboardSnapshot`, and `stats`, so MCP tools cannot reach the mothership or
event transports and cannot write DuckDB. Development Compose enables MCP with
a loopback TCP-peer check, so host-local tools need no token. Non-loopback and
production access requires an explicit bearer token; production remains off by
default because raw events can contain tenant data.

## Auth (the spine)

```
Login form → POST /auth/user_login (relative → proxy/forwarder → mothership)
  → { user, token }  or  OTP challenge → POST /auth/user/otp/verify
  → session (JWT) in localStorage.auth   [lib/auth.ts]
  → every request: Authorization: Bearer <token>   [lib/clients/api.ts]
  → 401 anywhere → session dropped, re-login       [AUTH_EVENTS.UNAUTHORIZED]
```

The user object also configures the softphone: `extension.{username,password}`
+ `environment.{domain,wss_server}` → `sipSettingsFromUser` — **no SIP endpoint
is baked into the code** (`VITE_SIP_*` is a dev/demo override only).

## The optional PostgREST plane

For tenant-custom tables/views that live beside the mothership. Enable it by
setting **`POSTGREST_URL`** on deno (unset ⇒ `/rest/v1/*` and the PostgREST
`/connectors/postgrest/auth/login` proxy answers 503 and the app is mothership-only).
When enabled, the connector JWT rides through — PostgREST verifies it with its own shared secret
(`VA_PGRST_JWT_SECRET`), so RLS can scope rows by the token's claims.

Frontend building blocks, layered like everything else:

- `lib/clients/postgrest.ts` — `pgrstList` / `pgrstGet` (relative `/rest/v1`,
  bearer auth, exact counts via `Content-Range`).
- `components/PostgrestTable/` — a generic drop-in table with server-side
  paging + sorting: `<PostgrestTable table="my_view" />`.

## Configuration

Env is the whole tenant surface — every knob is documented inline in
[.env.example](../.env.example) (frontend `VITE_*` only; deno reads the
unprefixed vars — never `VITE_`-prefix a secret). Defaults point at the
voipappz cloud; repoint a fork with the single `MOTHERSHIP_URL` (read by the
dev proxy, the prod forwarder, and `make dev`'s preflight).

## Verify

```bash
make verify        # deno-api + web + /health dependency report
# through the app server (any mode):
curl -s localhost:4200/tasks/customer_portal_data          # mothership, public → 200
curl -s localhost:4200/api/calls                           # mothership, authed → 401 without a token
curl -s localhost:4200/rest/v1/anything                    # optional plane → 503 unless POSTGREST_URL is set
curl -s localhost:4200/events?limit=10                     # newest DuckDB rows when EVENT_INSPECTOR_ENABLED=1
```
