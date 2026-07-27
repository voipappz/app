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
                          ├─ /rest/v1 ──► deno-api                  dist/)     ├─ /rest/v1 ──► POSTGREST_URL (optional)
                          └─ /auth/login, /ws/events,                          ├─ /ws/events (cable relay)
                             /deno-api ──► deno-api                            └─ /dashboard/*, /calls/*/transcript
```

`VITE_MOTHERSHIP_URL` exists only as a **direct-mode escape hatch** for
static-only hosting (e.g. the Fireberry embed) where no app server fronts the
bundle.

## Pieces

| Piece | Where | Role |
|---|---|---|
| React app | `src/` (Vite :4200) | UI. Strict data-access layering: `lib/auth.ts` (the one credential) → `lib/clients/` (transport) → `services/` (per-feature) → `components/` (folder-per-component; `Calls` is the blueprint). |
| deno-api | `api/` (:4001, entry `app.ts` → `server.ts`) | Thin BFF: mothership forwarder, `/ws/events` live cable relay, calls-per-hour (InfluxDB, server-side token), engine-backed transcript reads, `/health`. Serves `dist/` in prod. **Optional in dev** — without it the Dashboard extras stay quiet. |
| Mothership (voipappz-api) | external, env-pointed | Accounts + login (`/auth/user_login` + optional per-environment OTP), calls, reports, feature flags, portal branding. The source of truth. |
| PostgREST | external, **optional** | A second, direct-SQL data plane (`/rest/v1/*`) for tenant-custom tables/views — see below. |
| Cable (va-crystal) | external, optional | Live call events; deno subscribes and relays to `/ws/events`. |

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
`/auth/login` proxy answer 503 and the app is mothership-only). The same login
JWT rides through — PostgREST verifies it with its own shared secret
(`VA_PGRST_JWT_SECRET`), so RLS can scope rows by the token's claims.

Frontend building blocks, layered like everything else:

- `lib/clients/postgrest.ts` — `pgrstList` / `pgrstGet` (relative `/rest/v1`,
  bearer auth, exact counts via `Content-Range`).
- `components/PostgrestTable/` — a generic drop-in table with server-side
  paging + sorting: `<PostgrestTable table="my_view" />`.

## Configuration

Env is the whole tenant surface — every knob is documented inline in
[.env.example](./.env.example) (frontend `VITE_*` only; deno reads the
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
```
