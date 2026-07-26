# VoIPAppz portal

A **React + Vite** portal for VoIP/telecom tenants, built as reusable components
on top of the **voipappz-api mothership**. A tenant fork changes **env, not
code** — point `VITE_MOTHERSHIP_URL` at the tenant's backend and the same app
lights up against that tenant's data (login, calls, reports, feature flags).

- **Building a feature?** → [DEVELOPING.md](./DEVELOPING.md) (the data-access layer + "add a feature page" recipe)
- **How it fits together?** → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Repo conventions / gotchas?** → [CLAUDE.md](./CLAUDE.md)

---

## Quick start

```bash
cp .env.example .env          # set VITE_MOTHERSHIP_URL (the only required var)
npm install
npm run dev                   # → http://localhost:4200
```

That's the whole loop for frontend work: the app talks to the mothership over
HTTPS, so you don't need any backend running locally. Log in with a real
mothership user (or set `VITE_MOCK_LOGIN=1` in `.env` to log in offline with any
email + OTP `123456`).

## Two ways to run

| Mode | Command | When |
|---|---|---|
| **Frontend only** | `npm run dev` | Day-to-day UI work. Vite on :4200, proxies `/api/*` to the mothership. |
| **Full stack (Docker)** | `make up` | When you also need the deno backend (live-events WS, calls-per-hour chart, transcripts). Vite :4200 + deno-api :4001. |

The **deno backend is optional** — the core app (login, calls, reports, feature
flags) hits the mothership directly. deno-api only powers three Dashboard
widgets; without it, those simply stay quiet.

> **Gotcha:** editing `.env` and running `docker compose restart` does *not*
> re-read env vars. Use `docker compose up -d --force-recreate <service>`.

## Configuration

All configuration is env (see **[.env.example](./.env.example)** — copy it to
`.env`). The only required variable:

```bash
VITE_MOTHERSHIP_URL=https://cloud.voipappz.io   # the tenant's voipappz-api
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
| `make dev` | Run the app (deno-api in Docker + host Vite with HMR) |
| `make up` / `make down` | Start / stop the full Docker stack (web + deno-api) |
| `make build` | Production build (`dist/`) |
| `make test` | Playwright E2E (needs the app running) |
| `make verify` | Health check: deno-api, web, and dependency report |
| `make status` | Local git + production health (set `PROD_URL`) |
| `make deploy` / `make ship` | Kamal deploy / push + deploy |

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
npm test            # Vitest unit tests (services, hooks)
make test           # Playwright E2E (Input → Submit → capture → assert)
npm run build       # must be clean before shipping
```

## Internationalization

Hebrew (default, RTL) + English via `react-i18next`. Locales in
`src/i18n/locales/`. Use `useTranslation()` for copy and `useDirection()` for
layout direction.

## Deploy

`make deploy` builds the image, pushes to the registry, and swaps the container
via Kamal (sources `.kamal/secrets`). `make ship` = `git push` + deploy. After a
deploy, `make status` probes the deployed version. See
[DEPLOYMENT.md](./DEPLOYMENT.md) for the full flow and the per-tenant deploy
configs (`config/deploy.mtn.yml`, `config/deploy.pbx20.yml`).
