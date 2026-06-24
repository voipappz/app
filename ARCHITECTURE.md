# Architecture — VoIPAppZ admin template

A simple, env-driven template for a per-tenant VoIP admin. **The app consumes what it
can from the mothership and adds its own custom logic + local data on top.** Fork it per
tenant by changing env, not code.

## The model: consume the mothership, write custom

- **Mothership** (central, shared, owned elsewhere): **PostgREST/Kong** (accounts +
  call event store) and the **cable** (live call events). The app **CONSUMES** these —
  account login, historical reads, live event subscription. It does not own them; they're
  reached over env-configured endpoints (`KONG`, `CABLE_ADDR`, local or remote).
- **The app** (this repo, per tenant): **deno-api ("the brain")** + the React admin.
  It consumes the mothership AND **WRITES its own custom appz** — the transcription /
  recording worker, **DuckDB** analytics/BI fed from the cable, and any tenant-specific
  features. This local/custom side is what each fork actually builds.

```
        ┌──────── MOTHERSHIP (central, consumed) ────────┐        ┌──── THIS APP (local, custom) ────┐
        │  PostgREST/Kong   accounts + call event store  │        │  deno-api (brain) + React admin   │
        │  cable            live call events             │        │  worker, DuckDB, tenant features  │
        └───────▲───────────────────▲────────────────────┘        └──────────────┬───────────────────┘
                │ login + reads      │ live events (cable)                        │ writes custom
  React ──same──┤ (POST /auth/login, │                                            ▼
  (Vite :4200)  │  GET /rest/v1/…)   └────► deno cable consumer ──► DuckDB (analytics/BI) + /ws live push
        bearer  │                          deno worker ─────────► transcription / recording
        =JWT    └────► deno /auth/login ──► PostgREST /rpc/login (mothership accounts) ──► JWT ──► browser
```

## Principles

1. **Consume the mothership; own only your custom data.** Accounts + calls/events are
   the mothership's, read via PostgREST — the app never owns or duplicates them as truth.
   DuckDB and any app-specific tables are *derived/custom local* data, never authoritative.
2. **deno is the brain (BFF).** The browser only ever talks to deno (same origin) — no
   CORS, no exposed ports, one place for auth/logic. deno forwards to PostgREST and
   the cable.
3. **One login, one token.** Login posts account credentials → deno → PostgREST
   `api.login` (accounts table, bcrypt) → a signed **HS256 JWT** carrying
   `role: api_readonly`, `account_uuid`, `customer_uuid`, `environment_uuids`, `exp`.
   The browser stores it in `localStorage.auth` and sends it as the bearer on every
   request. The same token reads PostgREST (RLS-ready). **No Supabase.**
4. **Per-node, local-first.** Each node owns its own Postgres + DuckDB. The live cable
   stream is persisted locally into DuckDB for history/BI; FreeSWITCH can be a
   secondary/backup source later.
5. **Template by env, not code.** Brand, endpoints, and secrets are env-driven, so a
   tenant fork changes `.env`, not source.

## Pieces

| Piece | Where | Role |
|---|---|---|
| React admin | `src/` (Vite, :4200) | UI. Talks only to deno (same origin). |
| deno-api | `api/` (:4001) | The brain: `POST /auth/login`, reads, cable→DuckDB, `/ws`, worker. |
| PostgREST | host (`/rest/v1` via Kong / loopback :3001) | Reads + `rpc/login` over Postgres. |
| Postgres | host | Source of truth: `accounts`, `event_store_events`. |
| DuckDB | `api/data/` | Per-node derived cache: logs / history / BI. |
| Cable | va-crystal (:6000 `CallEvents`) | Live call events into deno. |

## Auth flow (the spine)

```
Login form → POST /auth/login {email,password}
  → deno → PostgREST POST /rpc/login   (api.login: accounts, bcrypt, signs the JWT)
  → { token, account_uuid, customer_uuid, environment_uuids } → localStorage.auth
  → every request: Authorization: Bearer <token>
  → PostgREST verifies the JWT (shared secret); RLS can scope rows by the claims
```
Code: `src/lib/auth.ts` (session + login) · `src/context/AuthContext.jsx` (route gate)
· `src/lib/postgrest.ts` (reads) · `api/server.ts` `POST /auth/login` → `POSTGREST_URL`.

## Key env (the template knobs)

| Env | Default | Purpose |
|---|---|---|
| `VITE_AUTH_URL` | `/auth/login` | Where the browser posts credentials (→ deno). |
| `VITE_REST_URL` | `/rest/v1` | PostgREST read base (same-origin via gateway). |
| `POSTGREST_URL` | `http://127.0.0.1:3001` | deno → PostgREST (login + reads). |
| `VA_PGRST_JWT_SECRET` | — | Shared secret so PostgREST verifies the login JWT. |
| `CABLE_URL` / `CABLE_SECRET` | `ws://127.0.0.1:6000/cable` | Live call-event cable. |
| `VITE_APP_NAME` / `VITE_BRAND_LOGO[_WHITE]` | `voipappz` | Brand (name + logo). |

## Status / roadmap

- **Done:** accounts login via deno→PostgREST; Supabase removed from the auth path;
  reads use the login JWT.
- **Next:** route reads through deno; RLS policies scoping events by
  `account_uuid`/`customer_uuid`; events-based logs/dashboard from DuckDB + `/ws`.
  Working plan: `.claude/plans/`.

## Verify

```bash
# login (accounts → JWT), through the browser path (Vite → deno → PostgREST)
curl -s -X POST localhost:4200/auth/login -H 'content-type: application/json' \
  --data '{"email":"<acct>","password":"<pw>"}'           # → { token, ... }
# read calls with that token
TOK=...; curl -s -H "authorization: Bearer $TOK" localhost:4200/rest/v1/calls?limit=3
```
