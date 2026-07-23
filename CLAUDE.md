# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VoipAppZ** - React + Deno application template for VoIP / telecom tenants.

> **📐 Architecture: see [ARCHITECTURE.md](./ARCHITECTURE.md)** — the simple, durable
> shape of this template. One source of truth (**Postgres via PostgREST**), one gateway
> (**deno-api = the brain/BFF**), one login token (**accounts table → JWT**, no Supabase).
> DuckDB is a per-node derived cache for logs/history/BI. Read it before changing auth,
> reads, or the dashboard. Tenant forks change **env, not code**.

## Quick Start

### Local Development Setup

```bash
# 1. Clone and install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# 3. Start development server (frontend only)
npm run dev

# 4. Or start full stack via Docker (recommended)
make up
```

### Docker Development (Recommended)

```bash
# Start core services (react-app + deno-api)
docker compose up -d

# Access containers
docker compose exec react-app-tichman bash
docker compose exec deno-api sh

# Start Claude CLI (opt-in, requires --profile tools)
docker compose --profile tools up -d claude
docker compose exec claude bash

# Stop all services
docker compose down
```

> **Gotcha**: editing `.env` and running `docker compose restart` does **not** re-read
> env vars (they're baked in at container create time). Use
> `docker compose up -d --force-recreate <service>` after any `.env` change.

## Common Commands

The Makefile is the canonical entry point — keep it lean. Anything not below is one-liner enough to run directly (`docker-compose logs -f pdf-api`, `npx playwright test tests/X.spec.ts`).

| Command | Description |
|---------|-------------|
| `make dev` | Vite dev server (frontend only) |
| `make up` | Start `react-app-tichman` + `deno-api` via docker-compose |
| `make down` | Stop backend |
| `make test` | Run all Playwright tests |
| `make duckdb-ui` | Recreate `deno-api` with DuckDB's built-in browser UI on → http://localhost:4213/ (live SQL notebook over the event store). `make up` turns it back off. |
| `make push` | `git push` current branch |
| `make deploy` | Kamal build → registry push → container swap on prod |
| `make ship` | `make push` + `make deploy` in one shot |

**Push and deploy go through the Makefile, not raw `git push` / `kamal deploy`.**
`make deploy` sources `.kamal/secrets` for ERB substitution in `config/deploy.yml`
(Kamal only auto-sources it for the registry password), and `make ship` chains
push + deploy so prod and the remote branch never drift. After `make deploy`
the post-deploy hook (`.kamal/hooks/post-deploy`) probes `/test`, `/`,
`/apps/pdf/health`, the auth-gated PDF routes, and `/webhook/docuseal` — a
deploy is only "done" once those pass.

## Architecture Overview

### Event Pipeline & Deno Services (cable → DuckDB)

Real-time call data flows from the **va-crystal `cable`** server into this app's
embedded DuckDB event store. **deno-api is a cable *client*** — it never touches
the broker or Redis directly.

```
FreeSWITCH → mod_amqp → LavinMQ → va-crystal cable
   (cable normalizes: groups by va_call_uuid, applies the call_types allow-list,
    broadcasts the baked event_record_json on the ActionCable "call_events" stream)
        → deno-api CallEvents subscriber (api/cable.ts — ActionCable WS client)
        → normalizeCableEvent → canonical call.* / user.* / queue.* event
        → DuckDB event store (append-only `events`) → calls_view projection
        → /ws/events fanout → React useCalls (live)
```

**Deno services** — one runtime service + one test-only (the old `pdf-api` was removed):

| Service (compose) | Profile | Port | Entry | Role |
|---|---|---|---|---|
| `deno-api` | core (always) | **4001** | `supabase.ts` → `server.ts` | HTTP API (auth, calls/reports, `/health`, `/test`), `/ws/events` WS for the UI, the **cable client**, DuckDB store, Gemini transcription worker, S3 |
| `deno-tests` | `test` | – | `deno test tests/` | Deno unit tests — `docker compose --profile test run --rm deno-tests` |

> **Port is 4001** (was 3000): deno-api runs `network_mode: host`, and :4000 is
> taken by the root stack's `node` Crystal agent. Update both compose + Makefile
> together if it ever changes.

**Cable connection — all env-driven, no hardcoded host:**

| Env | Default | Purpose |
|---|---|---|
| `CABLE_URL` | `ws://127.0.0.1:6000/cable` | Cable server WS URL. Localhost = same host / Kamal same-network; set it to the **external** cable server otherwise. |
| `CABLE_CHANNEL` | `CallEvents` | ActionCable channel to subscribe to. |
| `CABLE_TOKEN` | — | Ready-made HS256 JWT (skips minting). |
| `SECRET_KEY` | — | Cable's signing secret — used to mint the JWT. |
| `CABLE_ACCOUNT_UUID` | — | `account_uuid` claim for the minted JWT. |
| `CABLE_TAP` | `1` | `0` = seed-only run (no live subscription). |

Auth: the cable connection needs an HS256 JWT (`?token=`) carrying an
`account_uuid` claim, signed with the cable's `SECRET_KEY` (matches
`va-crystal/va-shared/src/cable_auth.cr`; **no expiry check**, so a backend mints
one long-lived token). Provide `CABLE_TOKEN`, or `SECRET_KEY` + `CABLE_ACCOUNT_UUID`
to mint at boot (`api/cable.ts` → `mintCableToken`).

**Mocking events** — real data only by default; mocks are opt-in:
- **Tests** (`api/tests/cable.test.ts`): the cable client is driven by a **fake
  WebSocket** (`socketFactory` DI) — no network. `mintCableToken` and
  `normalizeCableEvent` are unit-tested with mock payloads. (Crystal side uses
  `Cable::DevBackend` + `mock_redis`.)
- **Local/demo without a cable**: `MOCK_PUBLISH=1` emits synthetic `call.*`
  events **in-process** (no broker); `MOCK_SEED=1` seeds demo calls into an empty
  DuckDB. Both off by default.
- **Mocked transcription (frontend, `free-tel` branch only — ⚠️ DEMO-ONLY)**:
  the Calls list stays **real** (`cloud.voipappz.io/rest/v1/calls`), but the
  **Transcribe button is faked** — it skips the Gemini backend and replays a
  local `queued → processing → completed` progression that reveals a canned
  Hebrew conversation (chosen by call direction) from
  `src/components/Calls/conversation-mocks.ts`. Wired in
  `Calls.jsx` `triggerTranscribe()` (no env flag; always on in this branch). See
  **TASKS.MD → "Mocked Call Transcription for Demo"** for the revert checklist
  when switching to real transcription data.

`make verify` checks deno-api `/test`, the web app, the **cable server** TCP
reachability, and the `/health` dependency report (`cable` / `duckdb` / `supabase`).

### Frontend (React + Vite)
- **Framework**: React 19.2 with Vite 6.3.5 for development
- **UI Library**: Material-UI (MUI) 7.1+ + Radix UI components + Shadcn/ui
- **Styling**: TailwindCSS 3.4+ with RTL support and animations
- **State Management**: React Context (AuthContext, DirectionContext)
- **Internationalization**: react-i18next (Hebrew default, RTL)
- **Testing**: Playwright E2E tests with auth fixtures + Vitest for unit tests

### UX shell — WebRTC-portal layout (modeled on `../va-voipbox-admin`, 2026-06-26)
The app shell mimics the **old WebRTC portal** (`/opt/src-DONT-USE-HERE/va-voipbox-admin`,
an Ionic/AngularJS app with WebRTC built in). The header bar is forced to **`dir="ltr"`**
(`Layout.jsx`) so placement is PHYSICAL regardless of language: hamburger+title on the
LEFT, the phone on the RIGHT (the app is otherwise RTL). Two anchors:
- **Left:** a **hamburger** (`data-testid="menu-button"`) opens the **main menu as a
  left slide-out drawer** on every screen size (no inline top-bar nav). The drawer
  holds nav (Dashboard/Calls/Reports/Notifications/Status) + an **Options** section
  (language he⇄en, direction RTL⇄LTR) + logout — language/logout were moved OUT of the
  header into here. Impl: `MainMenu.jsx`.
- **Right:** the **softphone is a dark, full-height panel DOCKED to the right edge**,
  styled like the portal's phone dock — avatar header (`name • extension`), a
  **presence pill** (Available/Away/DND), ready-status line with a colored dot, bottom
  tabs **Calls · Dialpad · Settings**, borderless keypad, big green call CTA. Header
  icons: logs (terminal), **pin/stick**, close. Impl: `PhoneWidget.jsx`
  (`data-testid="phone-panel"`). Palette: panel `#3b4350`, header `#2f3640`, orange
  `#f5a623`, green `#34c759`.
- **RTL note:** MUI flips `Drawer` anchors under RTL, so both drawers pick their anchor
  from `isRTL` to stay physical (phone right, menu left). The phone Paper is `dir="ltr"`
  so the keypad reads 1-2-3 and tabs read Calls·Dialpad·Settings like the portal.
- **Pin/"stick":** the pin toggle makes the dock `variant="persistent"` (stays open, no
  backdrop, app stays usable) and persists to `localStorage['sip-phone-pinned']` so it
  survives reloads; closing (✕) unpins.

### Dashboard / Reports / Calls — data-source routing (direction, 2026-06-26)
Each screen has ONE authoritative source; do not cross them:
- **Calls → Postgres** via PostgREST (`VITE_REST_URL`, `useCalls.js`). ✅ already so.
- **Reports → InfluxDB** client (server-side, via deno-api — the apiv3 token never
  reaches the browser; same pattern as `useCallsPerHour.js`'s `/dashboard/calls-per-hour`).
  ⚠️ TODO: Reports currently piggybacks on `useCalls` (PostgREST) — move to InfluxDB.
- **Dashboard → cable WSS** (`../va-crystal` cable). The dashboard **structure** is
  defined in **`../voipappz-api`** (`Mediators::Customer::Init` seeds the "live"
  dashboard: an agents table [`extension_username, status, time_in_status, state,
  time_in_state, call_incoming_count, call_outgoing_count, call_duration, talking_to`]
  + a calls table), which **saves it on Redis**; **cable reads it from Redis and streams
  it**. **Cable sends only the value stream**, not the layout.
  - **Channel:** `DashboardLive` — subscribe `{channel, account_uuid, Live_uuid}`,
    stream `dashboard:live:{account_uuid}`. Broadcast payload =
    `{ "<widget_uuid>": { type:"table", table:[ {uuid, …fields} ] } }` (cable GETs
    `user:{uuid}:{field}` from Redis).
  - **Wiring (this app, Phase A built 2026-06-26):** deno-api bridges it — a second
    cable client (`api/cable.ts` generalized with `identifier`/`onRaw`) subscribes
    DashboardLive and re-emits frames on `/ws/events` as **`dashboard.live`**. Gated by
    **`CABLE_DASHBOARD_UUID`** (the dashboard's `Live_uuid`) + a real `CABLE_ACCOUNT_UUID`.
  - **React = pure stream renderer (display as-is).** Crystal owns all fetch/structure
    resolution; React does NOT call the dashboard API. `useDashboardLive.js` subscribes
    `/ws/events?topics=dashboard.#` and keeps the streamed `{ uuid: descriptor }` map;
    `widgets/DashboardWidgets.jsx` renders each descriptor using the **portal widget
    logic** (`models/widget.model.ts` shape): `type` (table/counter), `title`, grid
    `row/col/sizeX/sizeY`, header colors, and `columns:[{name, header_name, type, icon,
    display}]`. Cell formatting by column `type` (status/state → colored chip per
    `Identity::User.color?`, duration → mm:ss, timestamp, url, number). If a frame omits
    `columns`, they're derived from the row keys so it renders before the richer
    descriptor lands. Verified live by feeding a synthetic widget frame.
  - **Crystal side fixed (2026-06-26).** `Dashboard::AdminBroadcaster` was already
    implemented (the `task_account` scratch in `cable.cr` is dead code). The real bug:
    `DashboardLive` subscribed to `dashboard:live:{account}`, which nothing publishes to.
    Fixed to stream from the broadcaster's channel `dashboard:{Live_uuid}:consumer:{account}`
    (== `Dashboard::RedisCacheReader.cache_key`) — now the subscription, the scheduler's
    `PUBSUB CHANNELS dashboard:*:consumer:*` detection, the handoff key, and the publish
    target all align. Regression: `cable/spec/dashboard/dashboard_live_contract_spec.cr`
    (passes; `cable.cr` type-checks). **Drive it from Redis** (no voipappz-api needed):
    `cable/scripts/seed_dashboard_redis.sh` sets the handoff `dashboard:{uuid}:consumer:
    {account}` + `user:{uuid}:{field}` values; point deno's `CABLE_DASHBOARD_UUID` +
    `CABLE_ACCOUNT_UUID` at the same uuid/account. (Full live E2E needs a running
    Redis+cable+NATS, not available in the build sandbox.) (The InfluxDB
    `useCallsPerHour.js` still feeds the KPI chart.)
- **Toaster/notifications:** the incoming-call UX is a **slide-in toast** modeled on
  `va-voipbox-portal`'s `components/call-toast` — `src/components/Phone/CallToast.jsx`
  (green `#367823`, Answer/Reject), rendered by `PhoneWidget` (replaced the modal
  Dialog). General notifications still go through the `FireberryContext` toast; wiring
  the cable `Notifications` channel into it is the remaining piece.

### Porting from `../va-voipbox-portal` (Ionic + Angular 5 — UX/spec, not code)
The legacy customer/agent portal is the **UX & feature-set reference** (re-implemented
in React/MUI — no verbatim copy across frameworks). Ported so far: `call-toast` → toaster;
`models/widget.model.ts` → dashboard widget renderer; **`components/report-filters` →
`src/components/common/Filters.jsx`** (a reusable, controlled filter builder — types:
string, numeric, select, multiselect, time/date-range, boolean) with the pure predicate
helper **`src/components/common/filterModel.js`** (`applyFilters`, unit-checked), wired
into **Calls** and **Reports** (client-side over the loaded rows; moving Reports to a
server-side InfluxDB query honoring the filters is the remaining Phase B step). Its module catalog
(contacts, voicemails, queues, campaigns, conferences, announcements, ivrs, agent) is the
backlog of feature pages to port incrementally on the `Calls` scaffold.

### Backend (Deno API)
- **Runtime**: Deno TypeScript runtime
- **Purpose**: real-time calls/events (cable → DuckDB) + the `/ws/events` UI feed; plus PDF/email/DocuSeal/Fireberry stubs
- See **Event Pipeline & Deno Services** above for the authoritative description
- **Key Services**:
  - PDF contract generation with Hebrew support
  - SMTP email delivery via Nodemailer
  - DocuSeal e-signing integration
  - Fireberry CRM synchronization
  - Geolocation services
  - File upload and management

### Database (Supabase)

Single table — `users`. Schema lives in `migrations/template_001_users_table.sql`.

| Table | Purpose |
|---|---|
| `users` | User profiles & app role (`id`, `email`, `name`, `role`, `created_at`, `updated_at`) |

- **Auth**: Supabase Auth with JWT tokens
- **RLS**: enabled on `users`
- **Realtime**: Supabase realtime subscriptions

No other business tables are part of the template. Tenant-specific tables (orders, companies, installations, etc.) get added per-deployment as needed.

### Container Architecture

Default dev services (started by `docker compose up -d`):

| Service | Image | Port (host) | Role |
|---|---|---|---|
| `claude` | local build | – | Claude Code CLI session |
| `react-app` | `node:24.10.0` | `4200` | Vite dev server. Proxies `/apps/*` → `deno-api:4001` (see `VITE_DENO_API_TARGET`) |
| `deno-api` | `denoland/deno:latest` | `4001` | Main API: calls/events (cable → DuckDB), `/ws/events`, auth, transcription, email/DocuSeal/Fireberry stubs |

Opt-in services (require `--profile`):

| Service | Profile | Role |
|---|---|---|
| `claude` | `tools` | Claude Code CLI session |
| `deno-tests` | `test` | Deno API test suite |
| `test-build` | `test` | Production build test |
| `cypress-tests` | `test` | Legacy Cypress runner |
| `ngrok` | `tools` | Webhook tunnel for DocuSeal |
| `production` | `prod` | Production image build/run |

Start opt-in services with: `docker compose --profile <profile> up -d <service>`

### DuckDB built-in browser UI (live data inspector)

`deno-api` can serve DuckDB's official browser UI (the `ui` extension) as a live
SQL notebook over the call/event store the cable client is writing to. Bring it
up with `make duckdb-ui`, then open **http://localhost:4213/**.

- **It runs in-process inside `deno-api`**, on the *same* DuckDB connection the
  cable client writes through — so it sees incoming events live with no second process.
  DuckDB is single-writer; a separate `duckdb` CLI against `api/data/events.duckdb`
  would fail with a lock conflict. In-process is the only way to view live data.
- Off by default (`DUCKDB_UI=0`). `make duckdb-ui` recreates `deno-api` with
  `DUCKDB_UI=1`; `make up` recreates it with the UI off. Port is `DUCKDB_UI_PORT`
  (default `4213`); reachable on the host because `deno-api` is `network_mode: host`.
- Query `events` (the append-only source of truth) or the projections
  `calls_view`, `calls_per_hour`, `events_per_hour`, `registrations_view`.
- `GET /test` reports the live URL as `duckdb_ui`.
- **CA gotcha**: the stock `denoland/deno` image ships no system trust store, so
  DuckDB's native HTTP client can't TLS-verify when it fetches the UI frontend
  from `ui.duckdb.org`. Compose mounts the host CA bundle (`HOST_CA_BUNDLE`,
  default `/etc/ssl/certs/ca-certificates.crt`; RHEL: `/etc/pki/tls/certs/ca-bundle.crt`)
  and sets `SSL_CERT_FILE`. Without it the UI loads a blank/500 page.

**Request flow (API calls via Vite proxy)**:

```
Browser → Vite (4200, react-app) → /apps/* proxy → deno-api (3000) → pdf-api (8001)
```

Browser only sees the Vite origin → no CORS. If you see a CORS error mentioning
`http://localhost:4001`, the frontend is bypassing the proxy because
`VITE_API_BASE_URL` is set in `.env` — unset it.

## Environment Variables

### Required for Development
```bash
# Supabase (Frontend)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Supabase (Backend/Tests)
SUPABASE_SERVICE_ROLE_KEY=xxx

# Optional: SMTP, DocuSeal, Fireberry CRM
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASS=xxx
DOCUSEAL_API_KEY=xxx
FIREBERRY_TOKEN=xxx
```

### Variables you should NOT set in dev

- **`VITE_API_BASE_URL`** — when set, `src/lib/httpClient.ts` builds *absolute* URLs
  (`${VITE_API_BASE_URL}/apps/...`) that bypass Vite's proxy and trigger
  cross-origin browser requests. Leave it unset so URLs stay relative and route
  through Vite → `deno-api`. The symptom is `Cross-Origin Request Blocked … at
  http://localhost:3000/apps/...`.

## Database Status

Template state: **single `users` table only**. Migration file: `migrations/template_001_users_table.sql`. Apply it to a fresh Supabase project to bootstrap.

### User Roles
Application roles are defined in `src/config/permissions.js` under `ROLE_TEMPLATES`.
Supabase Auth's JWT role (`authenticated`) is not an app role.

Roles are defined per-tenant in `src/config/permissions.js` (`ROLE_TEMPLATES`). The template ships with two wildcard roles only:
- `admin` - wildcard access (`*`)
- `super_admin` - wildcard access (`*`)

Add tenant-specific roles (sales, technician, back-office, etc.) by extending `ROLE_TEMPLATES`.

## Current Tech Stack

### Frontend Dependencies (Key)
- **React**: 19.2.0 (latest)
- **Vite**: 6.3.5 (build tool)
- **Material-UI**: 7.1+ (UI library)
- **Radix UI**: Complete component collection
- **TailwindCSS**: 3.4+ with RTL support
- **Supabase**: 2.76+ (backend-as-a-service)
- **React Router**: 7.6+ (navigation)

### Development Tools
- **Playwright**: E2E testing
- **Vitest**: Unit testing  
- **ESLint**: Code linting
- **TypeScript**: Type safety
- **Autoprefixer**: CSS processing

## Testing Strategy

### Playwright E2E Tests (Primary Testing Framework)

Tests follow the **Input → Fill Form → Submit → Capture Response → Assert → Cleanup** pattern:

```typescript
test('should create record and verify', async ({ authenticatedPage: page }) => {
  // 1. Define input
  const input = { field: 'value', ... };
  
  // 2. Fill form
  await page.fill('[name="field"]', input.field);
  
  // 3. Setup response capture (before submit!)
  const responsePromise = page.waitForResponse(
    r => r.url().includes('/table') && r.request().method() === 'POST'
  );
  
  // 4. Submit
  await submitButton.click();
  
  // 5. Assert response
  const response = await responsePromise;
  const created = await response.json();
  expect(created.field).toBe(input.field);
  
  // 6. Verify in database
  expect(await verifyRecordExists('table', created.id)).toBe(true);
  
  // 7. Track for cleanup
  trackForCleanup('table', created.id);
});
```

### Test Structure
```
tests/
├── auth-fixture.ts          # Playwright auth fixture
├── auth-real.spec.ts        # Real-user login smoke test
├── debug-auth.spec.ts       # Authentication debugging
├── health-check.spec.ts     # Navigation and basic functionality
├── security.spec.ts         # Security and permissions
├── test-cleanup.ts          # Supabase cleanup utilities
├── helpers/                 # Shared test utilities
└── unit/                    # Vitest unit tests

api/tests/                   # Deno API tests
├── server.test.ts           # API boot + health endpoint
└── test_helpers.ts
```

### Unit Testing (Vitest)
- Component unit tests
- Hook testing
- Service layer testing
- Utility function testing

## Template Features

What the template ships with (per-tenant forks add their own on top):

- **Auth**: Supabase Auth + JWT, RLS-enabled `users` table
- **Roles / ACL**: `ROLE_TEMPLATES` in `src/config/permissions.js` (template ships `admin`, `super_admin`)
- **i18n**: react-i18next with Hebrew (RTL) + English
- **UI scaffolding**: Login, Layout, MainMenu, Notifications, Dashboard (skeleton), Calls (canonical example feature), Reports (data-table framework)
- **Deno API**: PDF/email/DocuSeal/Fireberry service stubs in `api/` — wire up per tenant as needed

## Development Patterns

### React Component Structure
- Create folder with JSX, CSS, and JS (hooks) files
- Keep components under 200-300 lines
- Use folder structure for single-use components within larger components
- Don't share hooks between components

### Auth Gate Pattern
```jsx
// AuthContext blocks rendering until auth is determined
if (!isInitialized) {
  return null; // Prevents race conditions
}
return <AuthContext.Provider>{children}</AuthContext.Provider>;
```

### i18n Usage
```jsx
import { useTranslation } from 'react-i18next';
import { useDirection } from '../context/DirectionContext';

function Component() {
  const { t } = useTranslation();
  const { direction } = useDirection();
  return <Box dir={direction}>{t('key.path')}</Box>;
}
```

### Product Categories
Products are categorized for payment calculations:

| Config Key | DB Value | Hebrew | English |
|---|---|---|---|
| `equipment_installments` | `OTC` | ציוד בתשלומים | Equipment Installments |
| `services` | `Service` | שירותים חודשיים | Monthly Services |
| `one_time` | `one time` | תשלום אחד | One Time Payment |
| `ip_phone` | `ip phone` | IP Phone | IP Phone |

## File Permissions

**Always fix permissions after creating/editing files:**

```bash
# Files
chmod 644 <file>

# Directories
chmod 755 <directory>

# Test results (after running tests)
chmod -R 755 test-results/ playwright-report/ 2>/dev/null || true
```

## Supabase MCP Integration

To integrate Supabase MCP for enhanced database operations:

### 1. Install Supabase MCP
```bash
# Using Claude Code MCP management
/config mcp add supabase
```

### 2. Configure MCP Settings
Add to `.claude/settings.json`:
```json
{
  "mcp": {
    "servers": {
      "supabase": {
        "command": "supabase-mcp",
        "args": ["--project-ref", "your-project-ref"],
        "env": {
          "SUPABASE_URL": "${VITE_SUPABASE_URL}",
          "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
        }
      }
    }
  }
}
```

### 3. Available MCP Operations
- Query tables directly from Claude Code
- Generate SQL migrations
- Inspect database schema
- Real-time data monitoring
- Database performance analysis

### 4. Usage Examples
```bash
# Query the users table
mcp supabase query "SELECT * FROM users LIMIT 10"

# Inspect schema
mcp supabase describe users
```

## General Rules

- Prefer simple solutions over complex abstractions
- Keep files under 200-300 lines and refactor when needed
- Never add stubbing or fake data for dev/prod environments
- Only mock data for tests
- Exhaust existing implementation options before introducing new patterns
- Never overwrite .env without confirmation
- Write code that accounts for dev, test, and prod environments

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/components/` | **React components** |
| ├── `Calls/` | Canonical example feature — replicate this layout when adding new features |
| ├── `Dashboard/` | Template skeleton dashboard + widgets |
| ├── `Layout/` | App shell |
| ├── `Login/`, `LoginLeft/` | Auth UI |
| ├── `MainMenu/` | Sidebar / nav |
| ├── `Notifications/` | Notification panel |
| ├── `Reports/` | Reusable reports/data-table framework |
| ├── `common/` | Shared components (`LanguageSelector`) |
| └── `ui/` | Shadcn/ui design system components |
| `src/context/` | React contexts (Auth, Direction, Audit) |
| `src/hooks/` | Custom hooks (currently `useACL`) |
| `src/i18n/` | i18next config + locales |
| `src/lib/` | API client, DB, Supabase, utils |
| `src/services/` | App-level services (ACL, audit, dashboard) |
| `src/theme/` | Material-UI theming |
| `src/utils/` | Utility functions (JWT, phone, reports) |
| `api/` | **Deno backend (events, transcription, email/DocuSeal/Fireberry stubs)** |
| └── `tests/` | Deno API tests |
| `tests/` | **Playwright E2E test suites** |
| `OLD/` | Legacy code (kept for reference) |
