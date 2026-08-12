# VoIPAppz portal

A **React + Vite** portal for VoIP/telecom tenants, built as reusable components
on top of the **voipappz-api mothership**. A tenant fork changes **env, not
code** — repoint the mothership with one var (`MOTHERSHIP_URL`) and the same app
lights up against that tenant's data (login, calls, reports, feature flags).

- **Documentation index** → [docs/README.md](./docs/README.md)
- **Building a feature?** → [docs/modules.md](./docs/modules.md)
- **How it fits together?** → [docs/architecture.md](./docs/architecture.md)
- **What is tested?** → [docs/testing.md](./docs/testing.md)
- **Repo conventions / gotchas?** → [CLAUDE.md](./CLAUDE.md)

---

## Start a tenant fork (this repo is a GitHub template)

```bash
gh repo create my-tenant-portal --template voipappz/app --private --clone
cd my-tenant-portal
make env                      # writes .env — set MOTHERSHIP_URL to your tenant
make dev                      # first run also creates and displays the MCP token
```

(Or click **Use this template** on GitHub.) A tenant fork changes **env, not
code** — branding, endpoints, and features are all `.env`-driven, and the
included GitHub Actions CI works out of the box in the new repo.

---

## Quick start

```bash
cp .env.example .env          # defaults work out of the box (cloud mothership)
make dev                      # → http://localhost:4200  (everything runs in Docker)
```

On the first `make env`, `make dev`, or `make up`, onboarding creates a private
`.mcp.env` file, prints its generated token, and tells you how to retrieve it.
Run `make mcp-token` at any time to show the MCP URLs, token, and Authorization
header again. The file is mode `0600`, git-ignored, and never loaded by Vite.

**Docker is the only requirement** — no local node/npm needed. Log in with a
real mothership user (or `VITE_MOCK_LOGIN=1 make up` for an offline login with
any email + OTP `123456`). Prefer host tooling? `npm install && npm run dev`
works too.

Every push is guarded by the repository's `.githooks/pre-push` hook. `npm
install` configures it automatically. Run the identical gate manually with
`npm run verify:push`. It covers ESLint, frontend unit tests, Deno type-check
and tests, a production build, and the mock-login browser flow through
Dashboard, Calls, and Reports.

## How it works

The browser always uses relative, same-origin URLs. In development Vite proxies
them; in production the Deno process serves the built React app and forwards
the same routes.

```text
Browser
  ├─ login, calls, reports, features ─► Vite/Deno ─► voipappz-api mothership
  ├─ Dashboard snapshot + widgets ────► Deno ─────► local DuckDB
  ├─ Raw events screen ───────────────► Deno GET /events ─► local DuckDB only
  └─ live Dashboard updates ──────────► Deno /ws/events

Developer MCP client ────────────────► Deno POST /mcp ─► local DuckDB only

va-crystal CHANNEL_HANGUP_COMPLETE
  └─ cdr.write.bulk ─► Core NATS ─┬─► voipappz-api inserts EventCdr
                                  └─► Deno stores the same raw row in DuckDB

Optional committed-event mode
  voipappz-api events.cdr ────────────► Deno ─► DuckDB
              events.cdr.replay ◄───── Deno
```

Core NATS is used without JetStream. By default Deno observes the same
`cdr.write.bulk` batch that the current Ruby API uses to insert `EventCdr`, and
stores its original `{call_uuid,data,metadata}` row unchanged in `raw_payload`.
Committed `events.cdr` deployments can opt into ordered request/reply replay,
which closes gaps and atomically advances a DuckDB checkpoint. Cable remains
optional for DashboardLive values and as the legacy call-event fallback when
`NATS_URL` is unset. See
[the architecture guide](./docs/architecture.md) for the full contract.

> **Committed-event mode:** the current sibling `voipappz-api` checkout exposes
> EventCdr through `/api/events`, but does not yet publish `events.cdr` or answer
> `events.cdr.replay`. Keep the default `cdr.write.bulk` subject until that
> producer/responder exists.

## Two ways to run

| Mode | Command | When |
|---|---|---|
| **Attached** | `make dev` | Day-to-day work: stack up + Vite logs following. Ctrl-C detaches; the stack keeps running. |
| **Detached** | `make up` / `make down` | Same stack in the background. Vite :4200 + deno-api :4001. |

The **deno backend is optional** — the core app (login, calls, reports, feature
flags) hits the mothership directly. deno-api powers the local Dashboard
projection and widget definitions, live events, transcripts, health reporting,
and the opt-in DuckDB event inspector; without it, those surfaces stay quiet.

> **Gotcha:** editing `.env` and running `docker compose restart` does *not*
> re-read env vars. Use `docker compose up -d --force-recreate <service>`.

## View raw DuckDB and API CDR events

Development Compose enables the read-only event inspector. Start the stack,
log in, then open **Raw events** (`/event-explorer`). It is a paginated DuckDB
table with text search and exact event-type, action, and call-ID filters. Select
a row to view or copy the original raw JSON plus Deno's normalized projection.
The screen reads persisted rows from DuckDB only; it never reads NATS or replay
responses directly. The same data is available from Deno:

```bash
curl 'http://localhost:4001/events?limit=25&offset=0'
curl 'http://localhost:4001/events?call_id=<uuid>&event_type=call.cdr'
curl 'http://localhost:4001/events?q=CHANNEL_HANGUP_COMPLETE'
```

**System status** (`/status`) has a separate Mothership API CDR panel backed by
`GET /api/events?event_type=EventCdr`. The panels are deliberately not merged:
one shows what this app actually persisted in DuckDB, and the other shows the
tenant-scoped EventCdr rows the upstream API currently exposes.

Production keeps this route off because CDR payloads can contain tenant call
data. An operator must deliberately set `EVENT_INSPECTOR_ENABLED=1` and
recreate the service to expose it.

## Develop against DuckDB with MCP

The development Deno process includes a read-only MCP server for developer
tools and coding agents. It can search raw events, return one call's chronological
timeline, compute the Dashboard snapshot, and report store statistics. Every
result comes from local DuckDB; the MCP implementation cannot call the
mothership, Cable, or NATS and has no write tools.

After `make dev` or `make up`, configure a host-local MCP client with URL
`http://localhost:4001/mcp` and Streamable HTTP transport—no additional setup
is needed. Development Compose accepts tokenless MCP requests only when their
TCP peer is loopback. Container, LAN, and remote clients require a private
token; obtain the generated value and exact header with `make mcp-token`.
Production remains disabled by default. See the complete setup, tool catalog,
examples, and security boundary in
[docs/mcp.md](./docs/mcp.md).

## Configuration

All configuration is env (see **[.env.example](./.env.example)** — copy it to
`.env`). Nothing is required out of the box — the browser uses relative URLs
and reaches the mothership through the app server (Vite proxy in dev, deno-api
forwarder in prod). Repoint a tenant fork with:

```bash
MOTHERSHIP_URL=https://tenant.example    # dev proxy + prod forwarder + preflight
```

Everything else (softphone SIP, dashboard extras, branding, mocks) is optional
and documented inline in `.env.example`. Do **not** set `VITE_API_BASE_URL` in
dev — it bypasses the Vite proxy and trips CORS.

## Make commands

```
make            # list targets
```

| Command | Description |
|---|---|
| `make dev` | Run the app in Docker (attached logs) |
| `make up` / `make down` | Start / stop the full Docker stack (web + deno-api) |
| `make mcp-token` | Show the generated development MCP token, URLs, and bearer header |
| `make build` | Production build (`dist/`, in Docker) |
| `make lint` / `make unit` | ESLint / Vitest in Docker |
| `make test` | Playwright E2E (needs the app running) |
| `make test-crystal` | Crystal lifecycle → DuckDB → Dashboard functional test |
| `make act-api` | Prove live ActionCable and Core-NATS ingestion into DuckDB, including MCP readback of a generated call, raw rows, Dashboard projection and committed-event replay; installs `act` into `/tmp` if needed |
| `make act` | Run the complete GitHub Actions workflow locally |
| `make verify` | Health check: deno-api, web, and dependency report |
| `make status` | Local git + production health (set `PROD_URL`) |
| `make deploy` / `make ship` | Deploy to the production server / push + deploy |

## Project layout

```
src/
  lib/          # auth (token/session) + clients/ (mothership api, login, portal)
  services/     # feature APIs, including the local DuckDB event reader
  hooks/        # cross-cutting hooks (useFeatures, useACL)
  components/   # Calls, Reports, Dashboard, Raw Event Explorer, Phone, common/
  context/      # Auth, Direction
  i18n/         # react-i18next (Hebrew RTL default + English)
  theme/        # MUI theme
api/            # Deno BFF: NATS/Cable ingestion, DuckDB + read-only MCP, health, transcripts
.agents/skills/ # repository-scoped Codex workflows shared by the team
tests/          # Playwright E2E
```

To add a feature, follow the **service → hook → component** recipe with `Calls`
as the blueprint — see [DEVELOPING.md](./DEVELOPING.md).

## Testing

```bash
make unit           # Vitest unit tests (services, hooks) — in Docker
make test           # Playwright E2E in Docker (app must be running: VITE_MOCK_LOGIN=1 make up)
make lint           # ESLint — in Docker
make build          # must be clean before shipping
npm run verify:push # complete local gate, including Deno + production browser smoke
make act-api        # execute the live Cable/Core-NATS/DuckDB/MCP CI job locally
```

## Developer skill

Codex discovers the checked-in `$develop-voipappz-portal` skill from
`.agents/skills/`. Invoke it explicitly when implementing or verifying changes;
it routes developers to the canonical architecture, Deno/Vite invariants, and
the correct test matrix. Codex can also select it automatically when a task
matches its description. See the official [OpenAI skill documentation](https://developers.openai.com/codex/skills).

## Internationalization

Hebrew (default, RTL) + English via `react-i18next`. Locales in
`src/i18n/locales/`. Use `useTranslation()` for copy and `useDirection()` for
layout direction.

## Deploy

Two ways, both Docker-only (nothing to install): `make prod` runs the
production image on this box (:8000); `make deploy` builds, pushes to the
registry, and swaps the container on the production server (`make ship` =
`git push` + deploy; `make status` probes the deployed version). See
[deployment guide](./docs/deployment.md).
