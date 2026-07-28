# VoIPAppz portal

A **React + Vite** portal for VoIP/telecom tenants, built as reusable components
on top of the **voipappz-api mothership**. A tenant fork changes **env, not
code** — repoint the mothership with one var (`MOTHERSHIP_URL`) and the same app
lights up against that tenant's data (login, calls, reports, feature flags).

- **Building a feature?** → [DEVELOPING.md](./DEVELOPING.md) (the data-access layer + "add a feature page" recipe)
- **How it fits together?** → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Repo conventions / gotchas?** → [CLAUDE.md](./CLAUDE.md)

---

## Start a tenant fork (this repo is a GitHub template)

```bash
gh repo create my-tenant-portal --template voipappz/app --private --clone
cd my-tenant-portal
make env                      # writes .env — set MOTHERSHIP_URL to your tenant
make dev
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

**Docker is the only requirement** — no local node/npm needed. Log in with a
real mothership user (or `VITE_MOCK_LOGIN=1 make up` for an offline login with
any email + OTP `123456`). Prefer host tooling? `npm install && npm run dev`
works too.

## Two ways to run

| Mode | Command | When |
|---|---|---|
| **Attached** | `make dev` | Day-to-day work: stack up + Vite logs following. Ctrl-C detaches; the stack keeps running. |
| **Detached** | `make up` / `make down` | Same stack in the background. Vite :4200 + deno-api :4001. |

The **deno backend is optional** — the core app (login, calls, reports, feature
flags) hits the mothership directly. deno-api only powers three Dashboard
widgets; without it, those simply stay quiet.

> **Gotcha:** editing `.env` and running `docker compose restart` does *not*
> re-read env vars. Use `docker compose up -d --force-recreate <service>`.

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
| `make build` | Production build (`dist/`, in Docker) |
| `make test` | Playwright E2E (needs the app running) |
| `make verify` | Health check: deno-api, web, and dependency report |
| `make status` | Local git + production health (set `PROD_URL`) |
| `make deploy` / `make ship` | Deploy to the production server / push + deploy |

## Project layout

```
src/
  lib/          # auth (token/session) + clients/ (mothership api, login, portal)
  services/     # one module per backend feature (callsApi, reportsApi, featuresApi)
  hooks/        # cross-cutting hooks (useFeatures, useACL)
  components/   # Calls (blueprint), Reports, Login, Phone, Dashboard, common/
  context/      # Auth, Direction
  i18n/         # react-i18next (Hebrew RTL default + English)
  theme/        # MUI theme
api/            # deno backend (BFF): /ws events relay, calls-per-hour, transcripts
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
```

## Internationalization

Hebrew (default, RTL) + English via `react-i18next`. Locales in
`src/i18n/locales/`. Use `useTranslation()` for copy and `useDirection()` for
layout direction.

## Deploy

Two ways, both Docker-only (nothing to install): `make prod` runs the
production image on this box (:8000); `make deploy` builds, pushes to the
registry, and swaps the container on the production server (`make ship` =
`git push` + deploy; `make status` probes the deployed version). See
[DEPLOYMENT.md](./DEPLOYMENT.md).
