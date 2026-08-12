# deno-api — the optional BFF

A thin Deno backend for the VoIPAppz portal. The core app (login, calls,
reports, feature flags) talks to the **mothership** directly and does not need
this service — deno-api only powers the Dashboard extras and serves the built
bundle in production.

> Architecture context: [../docs/architecture.md](../docs/architecture.md)

## What it does

- **Core-NATS CDR pipeline** — by default observes va-crystal's real
  `cdr.write.bulk` input alongside the API's EventCdr writer and stores every
  original `{call_uuid,data,metadata}` row. Optional `events.cdr` mode consumes
  committed IDs and reconciles gaps over `events.cdr.replay`. No JetStream.
- **`/ws/events`** — relays accepted live events to browser subscribers.
- **Optional Cable bridge** — `DashboardLive` agent/extension values, or legacy
  `CallEvents` when `NATS_URL` is unset.
- **`POST /connectors/postgrest/auth/login`** — optional PostgREST connector login.
- **`/auth/*`** — forwarded unchanged to the mothership user login/OTP API.
- **Dashboard snapshot** — KPIs, hourly call buckets, and recent calls projected
  from locally consumed events in DuckDB.
- **Optional Influx connector** — retained for tenant-specific analytics; it is
  not used by the current Dashboard.
- **Transcripts** — read on request from the engine's event store
  (`engine.ts`, server-side basic auth), JWT-gated.
- **`/health/live`, `/health/ready`, `/health`, `/test`** — process liveness,
  strict NATS readiness (plus replay when enabled), dependency/freshness
  reporting and smoke data.
  These are used by verification and the Kamal
  post-deploy hook. `/health.event_pipeline` exposes `received`, `persisted`,
  `duplicates`, `persistence_failures`, and `relayed` counters for the Crystal
  → DuckDB path; `/health.checks.event_store.events` is the current stored-row
  count. `/test` exposes the same processing counters in a compact response.
- **Static serving** — in production the same process serves `dist/`
  (`STATIC_DIR`), so one container runs the whole app.
- **`GET /events`** — opt-in paginated/searchable DuckDB inspector used by the
  `/event-explorer` Raw events screen. Filters: `q`, `event_type`, `action`,
  `call_id`, `limit`, and `offset`. Production leaves it off by default.
- **`POST /mcp`** — Streamable HTTP MCP server with read-only event search,
  call timelines, Dashboard projections and store statistics. Development
  Compose enables it for loopback clients; other clients require a bearer
  token. It reads local DuckDB only and exposes no write tools.

## Run

```bash
deno run --allow-net --allow-env --allow-read --watch api/app.ts   # native (PORT=4001)
docker compose up -d deno-api                                      # via compose (network_mode: host, :4001)
```

Configuration is env-driven — see the "Dashboard extras" section of
[`.env.example`](../.env.example) (`NATS_URL`, `NATS_CDR_SUBJECTS`, optional Cable credentials,
`ENGINE_URL` + `ACCOUNT_EMAIL`/`ACCOUNT_PASSWORD`, `EVENT_STORE_PATH`,
`EVENTS_STALE_SECONDS`). Secrets are server-side only — never `VITE_`-prefixed.
The optional DashboardLive relay merges burst updates over
`DASHBOARD_RELAY_INTERVAL_MS` and skips slow browser sockets above
`WS_MAX_BUFFERED_BYTES`; `CABLE_MAX_FRAME_BYTES` bounds upstream parsing and
`WS_MAX_CLIENTS` caps authenticated browser sockets. `/health` and `/test`
expose the associated counters.
Development Compose sets `MCP_ENABLED=1` and
`MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN=1`; native/production runs do not. Set a
non-empty `MCP_AUTH_TOKEN` for container, LAN, remote, or production access.
`make dev`/`make up` generate the private development value in `.mcp.env`, and
`make mcp-token` displays it. See [../docs/mcp.md](../docs/mcp.md).

## Tests

```bash
docker compose --profile test run --rm deno-tests        # in Docker
deno test --allow-net --allow-env --allow-read --allow-write --allow-ffi api/tests # native
make act-api                                             # live Cable/Core-NATS/DuckDB/MCP CI job
```

Unit tests use dependency injection (e.g. the cable client's `socketFactory`
takes a fake WebSocket). The API CI job additionally opens a real WebSocket to
`tests/fixtures/cable_service.ts`, completes the ActionCable subscription, and
checks the resulting raw DuckDB rows and Dashboard call. `tests/event_store.test.ts`
sends the exact string-valued `message` produced by va-crystal's
`Cable.server.publish("call_events", event_record_json)`, then verifies the
three-event call lifecycle was persisted and projected from DuckDB.

For a functional local test through the running app, set
`MOCK_CRYSTAL_EVENTS=1`, start the API, then generate a complete call:

```bash
curl -X POST http://localhost:4001/test/crystal/events \
  -H 'content-type: application/json' \
  -d '{"direction":"inbound","from":"100","to":"200"}'
curl http://localhost:4001/test
```

The endpoint is absent unless the flag is explicitly enabled. Generated events
use Crystal's JSON-text Cable contract and follow the same normalization,
DuckDB persistence, deduplication, WebSocket relay, and Dashboard projection as
live events.

To inject the exact current NATS writer shape without a broker, use the same
test-only flag and endpoint:

```bash
curl -X POST http://localhost:4001/test/nats/events \
  -H 'content-type: application/json' \
  -d '{"subject":"cdr.write.bulk","message":[{"call_uuid":"call-1","data":{"va_call_uuid":"call-1","duration":"42","billsec":"30","hangup_cause":"NORMAL_CLEARING"},"metadata":{"Event-Name":"CHANNEL_HANGUP_COMPLETE","Event-Date-Timestamp":"1786104060000000"}}]}'
```

The raw object under `message[0]` is what the Raw events screen returns as
`raw_payload`; normalization is shown separately.

## Current and committed CDR contracts

The default `cdr.write.bulk` payload is the JSON array produced by va-crystal's
`EventSubscriber.build_cdr_payload` and consumed by voipappz-api's
`Jobs::WriteCDRBulk`. Deno is a plain observer, not a queue-group member, so it
receives its own copy. Because the input is pre-commit and has no event id, a
stable hash of each raw row is the local idempotency key and there is no replay.

`events.cdr` accepts only `cdr.recorded.v1` envelopes with `event_type=EventCdr`,
a producer `event_id`, a call id and object data. Reconciliation requests
`{"after_event_id": <cursor>, "limit": 250}` on `events.cdr.replay` and expects
ordered `cdr.replay.v1` pages. A page and its next cursor commit atomically.

`make act-api` subscribes to a hermetic va-crystal-compatible ActionCable
service and consumes ringing, answer and hangup events through the real network
client, then reads that exact call back through the token-protected MCP
`duckdb_call_timeline` tool. It also publishes a real va-crystal-shaped `cdr.write.bulk` batch through
Core NATS and verifies the untouched raw rows plus Dashboard calls in DuckDB. In
the same job, a committed-event fixture proves replay and producer-id handling.
The sibling `voipappz-api` checkout has a tenant-scoped HTTP EventCdr list but
no `events.cdr` publisher/replay responder, so use the default bulk subject in
production and treat committed-event mode as an optional future integration.

Operational checks:

```bash
curl localhost:4001/health/live
curl localhost:4001/health/ready
curl localhost:4001/health
curl 'localhost:4001/events?limit=10' # when EVENT_INSPECTOR_ENABLED=1
curl 'localhost:4001/events?q=CHANNEL_HANGUP_COMPLETE&call_id=call-1'
```
