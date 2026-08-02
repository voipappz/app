# deno-api — the optional BFF

A thin Deno backend for the VoIPAppz portal. The core app (login, calls,
reports, feature flags) talks to the **mothership** directly and does not need
this service — deno-api only powers the Dashboard extras and serves the built
bundle in production.

> Architecture context: [../docs/architecture.md](../docs/architecture.md)

## What it does

- **`/ws`** — relays live call events: subscribes to the va-crystal cable
  server (ActionCable `CallEvents` channel, `cable.ts`) and fans frames out to
  browser WebSocket subscribers (the Dashboard).
- **`POST /connectors/postgrest/auth/login`** — optional PostgREST connector login.
- **`/auth/*`** — forwarded unchanged to the mothership user login/OTP API.
- **Dashboard snapshot** — KPIs, hourly call buckets, and recent calls projected
  from locally consumed events in DuckDB.
- **Optional Influx connector** — retained for tenant-specific analytics; it is
  not used by the current Dashboard.
- **Transcripts** — read on request from the engine's event store
  (`engine.ts`, server-side basic auth), JWT-gated.
- **`/health` / `/test`** — dependency report (cable, engine, event
  freshness via `health_freshness.ts`) used by verification and the Kamal
  post-deploy hook. `/health.event_pipeline` exposes `received`, `persisted`,
  `duplicates`, `persistence_failures`, and `relayed` counters for the Crystal
  → DuckDB path; `/health.checks.event_store.events` is the current stored-row
  count. `/test` exposes the same processing counters in a compact response.
- **Static serving** — in production the same process serves `dist/`
  (`STATIC_DIR`), so one container runs the whole app.

## Run

```bash
deno run --allow-net --allow-env --allow-read --watch api/app.ts   # native (PORT=4001)
docker compose up -d deno-api                                      # via compose (network_mode: host, :4001)
```

Configuration is env-driven — see the "Dashboard extras" section of
[`.env.example`](../.env.example) (`SECRET_KEY`/`CABLE_URL`/`CABLE_TOKEN`,
`ENGINE_URL` + `ACCOUNT_EMAIL`/`ACCOUNT_PASSWORD`, `EVENT_STORE_PATH`,
`EVENTS_STALE_SECONDS`). Secrets are server-side only — never `VITE_`-prefixed.

## Tests

```bash
docker compose --profile test run --rm deno-tests        # in Docker
deno test --allow-net --allow-env --allow-read api/tests # native
```

Tests use dependency injection (e.g. the cable client's `socketFactory` takes a
fake WebSocket) — no network. `tests/event_store.test.ts` sends the exact
string-valued `message` produced by va-crystal's
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
