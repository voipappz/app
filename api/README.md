# deno-api — the optional BFF

A thin Deno backend for the VoIPAppz portal. The core app (login, calls,
reports, feature flags) talks to the **mothership** directly and does not need
this service — deno-api only powers the Dashboard extras and serves the built
bundle in production.

> Architecture context: [../ARCHITECTURE.md](../ARCHITECTURE.md)

## What it does

- **`/ws`** — relays live call events: subscribes to the va-crystal cable
  server (ActionCable `CallEvents` channel, `cable.ts`) and fans frames out to
  browser WebSocket subscribers (the Dashboard).
- **`POST /auth/login`** — auth proxy to the mothership.
- **Dashboard snapshot** — KPIs, hourly call buckets, and recent calls projected
  from locally consumed events in DuckDB.
- **Optional Influx connector** — retained for tenant-specific analytics; it is
  not used by the current Dashboard.
- **Transcripts** — read on request from the engine's event store
  (`engine.ts`, server-side basic auth), JWT-gated.
- **`/health` / `/test`** — dependency report (cable, engine, event
  freshness via `health_freshness.ts`) used by `make verify` and the Kamal
  post-deploy hook.
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
fake WebSocket) — no network.
