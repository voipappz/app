# VoipAppZ Dashboard

React + Deno application template for VoIP/telecom tenants. Ships with Supabase auth and a single `users` table; tenant-specific business tables are added per-deployment.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
make test
```

## Architecture Overview

```
FreeSWITCH → mod_amqp → LavinMQ → va-crystal cable
    → deno-api (ActionCable client) → DuckDB event store
    → /ws/events WebSocket → React UI (live updates)
```

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19.2, Vite 6.3.5, Material-UI 7.1, TailwindCSS 3.4, RTL support |
| **Backend** | Deno, DuckDB (event store), Supabase (auth + RLS) |
| **Real-time** | ActionCable (va-crystal), WebSocket (`/ws/events`) |

> **⚠️ Demo mock (branch `free-tel` only):** the Calls list is real
> (`cloud.voipappz.io`), but the **Transcribe button is faked** — it skips the
> Gemini backend and shows a canned Hebrew conversation locally so a client can't
> tell. Code: `src/components/Calls/conversation-mocks.ts` +
> `Calls.jsx` `triggerTranscribe()`. To switch to real transcription, follow the
> revert checklist in **TASKS.MD → "Mocked Call Transcription for Demo"**.

## Docker Development (Recommended)

### Start the Environment

```bash
# Start core services (react-app + deno-api)
docker compose up -d

# Or use make
make up
```

**Services started by default:**

| Service | Port | Description |
|---------|------|-------------|
| `react-app-tichman` | 5174→5173 | Vite dev server, proxies API calls to deno-api |
| `deno-api` | 4001 | HTTP API, WebSocket events, DuckDB store, cable client |

**Opt-in services (start explicitly):**

```bash
# Claude CLI dev shell
docker compose --profile tools up -d claude

# Run Deno API tests
docker compose --profile test run --rm deno-tests

# Production build test
docker compose --profile test run --rm test-build
```

### Access Containers

```bash
docker compose exec react-app-tichman bash
docker compose exec deno-api sh
docker compose exec claude bash  # if started with --profile tools
```

### Stop Services

```bash
docker compose down
# or: make down
```

> **Gotcha**: Editing `.env` requires `docker compose up -d --force-recreate <service>` to apply changes (restart does not re-read env vars).

## Make Commands

| Command | Description |
|---------|-------------|
| `make dev` | Vite dev server (frontend only) |
| `make up` | Start react-app + deno-api via docker compose |
| `make down` | Stop all services |
| `make test` | Run all Playwright tests |
| `make test-auth` | Run auth-specific tests |
| `make duckdb-ui` | Enable DuckDB browser UI at http://localhost:4213 |
| `make verify` | Health check: API, web, cable server, dependencies |
| `make backup` | Back up Supabase data to `backups/` |
| `make push` | Git push current branch |
| `make deploy` | Kamal build → registry push → container swap |
| `make ship` | `make push` + `make deploy` combined |
| `make status` | Git status + production health |

## Playwright E2E Testing

### Test Structure

```
tests/
├── auth-fixture.ts          # Auth fixture + navigation helpers
├── auth-real.spec.ts        # Real Supabase login flow
├── calls-api.spec.ts        # Calls endpoint tests
├── calls-events.spec.ts     # WebSocket event subscription
├── calls-ui.spec.ts         # UI rendering tests
├── dashboard-mock.spec.ts   # Dashboard with mock data
├── health-check.spec.ts     # Service availability
├── security.spec.ts         # ACL & permissions
├── test-cleanup.ts          # Supabase cleanup utilities
└── helpers/                 # Shared test utilities

api/tests/                   # Deno API tests
├── cable.test.ts            # Cable client tests (mock WS)
├── store.test.ts            # DuckDB store operations
├── calls_endpoint.test.ts   # HTTP endpoint tests
└── transcription.test.ts    # Transcription worker tests
```

### Test Pattern

Tests follow: **Input → Fill Form → Submit → Capture Response → Assert → Cleanup**

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

  // 6. Verify & cleanup
  expect(await verifyRecordExists('table', created.id)).toBe(true);
  trackForCleanup('table', created.id);
});
```

### Test Results

- HTML report: `playwright-report/`
- Screenshots/Videos: `test-results/`
- View report: `npx playwright show-report`

## Auth Gate Pattern

The app blocks rendering until auth is determined:

```jsx
// AuthContext.jsx
if (!isInitialized) {
  return null; // Prevents race conditions
}
return <AuthContext.Provider>{children}</AuthContext.Provider>;
```

**401 Event Handling:**
```javascript
// API interceptor dispatches event
if (error.response?.status === 401) {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}
// AuthContext listens and logs out
```

## Internationalization (i18n)

Hebrew (default, RTL) and English supported via `react-i18next`.

```jsx
import { useTranslation } from 'react-i18next';
import { useDirection } from './context/DirectionContext';

function MyComponent() {
  const { t } = useTranslation();
  const { direction } = useDirection();

  return (
    <Box dir={direction}>
      <h1>{t('orders.pageTitle')}</h1>
    </Box>
  );
}
```

**Locales:** `src/i18n/locales/he.json`, `src/i18n/locales/en.json`

## Environment Variables

### Required

```bash
# Supabase (Frontend)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Supabase (Backend/Tests)
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Optional (Backend Services)

```bash
# Cable connection (for live call events)
SECRET_KEY=xxx           # Cable's signing secret
CABLE_URL=ws://127.0.0.1:6000/cable

# Transcription (Google Gemini)
GEMINI_API_KEY=xxx
GEMINI_MODEL=gemini-2.0-flash

# S3/MinIO (call recordings)
S3_ENDPOINT=xxx
S3_KEY=xxx
S3_SECRET=xxx

# SMTP, DocuSeal, Fireberry (stubs)
SMTP_HOST=smtp.example.com
DOCUSEAL_API_KEY=xxx
FIREBERRY_TOKEN=xxx
```

### Do NOT Set in Dev

- **`VITE_API_BASE_URL`** — causes CORS issues by bypassing Vite proxy

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/components/` | React components |
| `src/components/Calls/` | Canonical feature example (replicate for new features) |
| `src/components/Dashboard/` | Dashboard + widgets |
| `src/components/Reports/` | Data-table framework |
| `src/context/` | React contexts (Auth, Direction, Audit) |
| `src/lib/` | API client, DB, Supabase utilities |
| `src/i18n/` | i18next config + locales |
| `api/` | Deno backend (events, transcription, stubs) |
| `api/tests/` | Deno API tests |
| `tests/` | Playwright E2E tests |

## DuckDB Browser UI

Live SQL notebook over the event store:

```bash
make duckdb-ui
# Opens http://localhost:4213/
```

Tables: `events` (source of truth)
Views: `calls_view`, `calls_per_hour`, `events_per_hour`, `registrations_view`

Turn off: `make up` (recreates deno-api without UI)

## Support

- Project instructions: `CLAUDE.md`
- Deployment guide: `DEPLOYMENT.md`
- Auth documentation: `AUTH.md`
