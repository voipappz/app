# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**VoipAppZ portal** — a React 19 + Vite admin portal for VoIP/telecom tenants.
The app is component-based and talks to **one backend: the voipappz-api
"mothership"**, always same-origin through the app server (Vite proxy in dev,
deno-api forwarder in prod). A tenant fork changes **env, not code**.

- **How it fits together** → [docs/architecture.md](./docs/architecture.md)
- **How to add a feature** (service → hook → component recipe, data-access layer, feature flags) → [DEVELOPING.md](./DEVELOPING.md)
- **How to deploy** (Docker-only) → [docs/deployment.md](./docs/deployment.md)
- **The deno backend** → [api/README.md](./api/README.md)

## Commands

| Command | Description |
|---|---|
| `make env` | Create `.env` from the template (never overwrites an existing one) — then set `MOTHERSHIP_URL` |
| `make dev` | Run the app in Docker — Vite HMR :4200 + deno-api :4001, attached logs. The usual loop; needs only Docker. |
| `make up` / `make down` | Same stack, detached |
| `make lint` / `make unit` | ESLint / Vitest one-shot — run in Docker (host `npm run lint` / `npm test` also work if you have node) |
| `make test` | Playwright E2E in Docker — needs the app running; use `VITE_MOCK_LOGIN=1 make up` first for the offline suite |
| `docker compose --profile test run --rm deno-tests` | Deno API tests (or natively: `deno test --allow-net --allow-env --allow-read api/tests`) |
| `make build` | Production bundle → `dist/`, built in Docker. Must be clean before shipping. |
| `make verify` | Health check: deno-api, web, and the `/health` dependency report |
| `make prod` / `make prod-down` | Run the production image on this box via docker compose (:8000) |
| `make deploy` / `make ship` | Deploy to the production server / push + deploy — **always via the Makefile**; Docker-only, see `docs/deployment.md` |

## Architecture (big picture)

Two runtime pieces:

1. **React app** (`src/`, Vite :4200). All backend access goes through the
   mothership over the Vite proxy. Data-access layering is strict:
   - `src/lib/auth.ts` — the one credential (login JWT in `localStorage`, session helpers).
   - `src/lib/clients/` — transport: `api.ts` (`apiList`/`apiGet` — adds the Bearer token, reads `X-Total`, drops the session on 401), `mothership.ts` (two-step login: password → optional per-customer OTP), `customerPortal.ts` (public branding).
   - `src/services/` — one module per backend feature (`callsApi.js`, `reportsApi.js`, `featuresApi.js`): knows the endpoint, query params, and row normalization.
   - `src/components/<Feature>/` — folder-per-component with its own hook (`useCalls.js` pattern). Components never build URLs or set headers.

   **`Calls` is the blueprint feature** — replicate its service → hook →
   component shape for new pages (full recipe in DEVELOPING.md).

2. **deno-api** (`api/`, :4001, entry `api/app.ts` → `server.ts`) — an
   **optional** thin BFF. It only powers Dashboard extras: the `/ws` live
   call-event relay (cable client to va-crystal ActionCable), calls-per-hour
   from the local DuckDB event projection, engine-backed transcript reads, and the
   `/auth/login` proxy. Without it those widgets simply stay quiet. In
   production the same process serves `dist/` (one container — `make prod`
   locally, `make deploy` to the server).
   Runs `network_mode: host` in compose.

There is **no Supabase** — auth is mothership accounts + a JWT. **PostgREST is
an optional second data plane** for tenant-custom tables: set `POSTGREST_URL`
on deno and `/rest/v1/*` forwards to it (503 when unset); the frontend building
blocks are `lib/clients/postgrest.ts` + `components/PostgrestTable/`.

## Environment

Env is the whole tenant-configuration surface — see `.env.example` (documented
inline). Nothing is required out of the box; repoint a tenant fork with
one var: `MOTHERSHIP_URL` (read by the dev Vite proxy, the prod deno
forwarder, and `make dev`'s preflight).

- **The browser never carries a backend host.** Clients build relative URLs;
  the Vite proxy (dev) or the deno forwarder (prod) owns the actual mothership
  host. `VITE_MOTHERSHIP_URL` is the direct-mode escape hatch for static-only
  hosting (e.g. the Fireberry embed) — leave it unset otherwise.
- **Never set `VITE_API_BASE_URL` in dev** — it bypasses the Vite proxy and
  trips CORS.
- **Never `VITE_`-prefix a secret** — `VITE_*` is baked into the public browser
  bundle; deno-only vars (engine creds and cable secret) must stay
  unprefixed.
- Editing `.env` + `docker compose restart` does **not** re-read env vars — use
  `docker compose up -d --force-recreate <service>`.
- `VITE_MOCK_LOGIN=1` gives an offline login (any email, OTP `123456`) for
  frontend work with no backend, and is what the CI E2E job builds with so
  Playwright can drive the real login flow hermetically (no credentials, no
  network). It deliberately mirrors the mothership's two-step user-OTP shape
  (the server's `VA_TEST_OTP` knob) and returns a user with
  `extension`/`environment`, so post-login paths (session decode, SIP
  derivation) are exercised too. It is a **build-time** flag: production
  builds never set it, so the shipped bundle can't be toggled into mock auth.

## Conventions

- Folder-per-component (`Component.jsx` + hooks + css together), components
  under ~300 lines, don't share hooks between components.
- i18n via `react-i18next` — Hebrew (RTL) is the default; use `useTranslation()`
  for copy and `useDirection()` for layout. UI is MUI 7 + Radix/shadcn +
  Tailwind.
- Unit tests (Vitest) target service modules and hooks, mocked at the
  `apiList`/`apiGet` boundary — never the network. Playwright specs live in
  `tests/` (Input → Submit → capture response → assert).
- Deno tests use dependency injection (fake WebSocket via `socketFactory`) — no
  network.
- Prefer simple solutions; exhaust existing patterns before introducing new
  ones. Never add fake/stub data outside tests. Never overwrite `.env` without
  confirmation.
