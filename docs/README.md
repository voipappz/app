# VoIPAppZ Admin

A lightweight, self-hostable admin for a VoIP tenant — **real-time call logs, dashboards, and
analytics** on top of your existing VoIPAppZ platform. It's a **template**: fork it per tenant and
configure with environment variables, not code.

> **In one line:** the app *consumes* what it needs from the central platform (the "mothership") —
> accounts, call history, live events — and adds its *own* logic and local analytics on top.

---

## What you get

- 🔐 **Account login** — sign in with your existing VoIPAppZ account (no separate user system).
- 📞 **Calls** — searchable, filterable call history with per-call event timelines.
- 📊 **Dashboard** — KPIs, calls-per-hour, and a live event feed that updates in real time.
- 🎙️ **Transcription & recordings** — optional per-call transcripts and recording playback.
- 🌍 **i18n / RTL** — Hebrew (default) and English out of the box.
- 🧩 **Template-first** — brand, endpoints, and secrets are all environment-driven.

---

## How it works

The app is two local pieces — a **React admin** (the UI) and **deno-api** (the backend "brain") —
that connect out to your platform's shared services.

```
        ┌──────── MOTHERSHIP (central platform, consumed) ────────┐     ┌──── THIS APP (local) ────┐
        │  PostgREST / API   accounts + call history              │     │  deno-api  (the brain)    │
        │  cable             live call events                     │     │  React admin (the UI)     │
        └───────▲──────────────────────▲─────────────────────────┘     └───────────┬──────────────┘
                │ login + read history  │ live events                               │ analytics, worker
   Browser ─────┤                       └────► deno consumes the cable ────────────►│  (DuckDB, transcription)
   (the UI)     └────► deno login ─────► account JWT ─────────────────────────────► browser
```

- **Consumes from the platform:** account login, historical call reads (via the API), and live
  call events (via the cable).
- **Owns locally:** a fast analytics store (DuckDB) fed by the live event stream, plus custom work
  like transcription — this is what each tenant fork builds on.

The browser only ever talks to **deno-api** (same origin), so there's no CORS and one place for
auth and logic. One account login produces one token, used for everything.

> For the engineering deep-dive, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## Quick start (local)

**Prerequisites:** Docker, Node 20+, and reachable platform services (API gateway + cable —
local or remote).

```bash
git clone <repo> && cd apps/app
cp .env.example .env          # then fill in the values (see Configuration)
make dev                      # checks the platform, starts deno-api + the UI
```

`make dev` will:
1. verify the platform (API gateway + cable) is reachable,
2. start the **deno-api** backend,
3. serve the **UI** on `http://localhost:4200` (binds `0.0.0.0`, so it's reachable on your LAN/host IP too).

Then open **http://localhost:4200** and sign in with a platform account.

> Pointing at a remote platform? `make dev KONG=http://your-host:8000 CABLE_ADDR=your-host:6000`

---

## Authentication

Login uses your platform's **account** (email + password) — there is no separate user database.

1. The UI posts credentials to deno-api `POST /auth/login`.
2. deno-api forwards to the platform login, which returns a signed **JWT** (carrying your account
   and environment scope).
3. The token is stored in the browser and sent on every request; reads are authorized with it.

Tokens last 1 hour; signing in again refreshes them.

---

## Configuration

All configuration is via environment variables (`.env`). The essentials:

| Variable | Purpose |
|---|---|
| `KONG` / `VITE_POSTGREST_TARGET` | Platform API gateway (login + call reads). |
| `POSTGREST_URL` | Where deno-api reaches the platform API. |
| `CABLE_URL` / `CABLE_ADDR` | Live call-event cable. |
| `VITE_APP_NAME` | Brand name shown in the UI. |
| `VITE_BRAND_LOGO` / `VITE_BRAND_LOGO_WHITE` | Brand logos. |
| `GEMINI_API_KEY` | *(optional)* enables call transcription. |
| `S3_ENDPOINT` / `S3_KEY` / `S3_SECRET` | *(optional)* recording storage for transcription. |

Local vs remote platform is purely a matter of these values — no code changes.

---

## Testing

```bash
make dev                                   # start the app first
npx playwright test tests/local-walkthrough.spec.ts   # end-to-end: login → dashboard → calls
npx playwright test tests/auth-real.spec.ts           # auth flow
docker compose --profile test run --rm deno-tests     # backend (deno) unit tests
```

The walkthrough test drives a real browser: log in, land on the dashboard, and assert real call
rows render.

---

## Project layout

```
apps/app/
├── src/                      # React admin (UI)
│   ├── lib/auth.ts           #   account session + login
│   ├── lib/postgrest.ts      #   call/event reads
│   ├── components/Calls/      #   calls list + detail
│   └── components/Dashboard/  #   KPIs, charts, live feed
├── api/                      # deno-api (the brain)
│   ├── server.ts             #   gateway: /auth/login, /ws, health
│   ├── cable.ts + store.ts   #   live events → DuckDB analytics
│   └── transcription.ts      #   transcription/recording worker
├── tests/                    # Playwright + deno tests
├── ARCHITECTURE.md           # engineering deep-dive
└── Makefile                  # make dev / test / deploy
```

---

## Deployment

Production runs the same backend that serves the built UI, deployed via Kamal:

```bash
make deploy        # build image → push → swap container on the host
```

The platform services (API gateway, cable) are configured per host through environment — the same
knobs as local, pointed at the production platform.

---

*VoIPAppZ Admin is a template — fork it, set your environment, brand it, and ship.*
