# Testing and verification

## Required local gates

| Command | Coverage |
|---|---|
| `npm run verify:push` | ESLint, frontend unit tests, Deno check/tests, production build and Playwright end-user smoke. |
| `npm run test:crystal` | Production API image, realistic Crystal lifecycle, DuckDB persistence, health counters and Dashboard projection. |
| `make test-crystal` | Make wrapper for the Crystal functional test. |
| `make prod` | Builds/runs the exact local production artifact on port 8000 and probes `/`, `/test` and `/health`. |

The Git pre-push hook runs `npm run verify:push`, so a normal push is rejected
when the core gate fails.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests.

| Job | What it proves |
|---|---|
| Frontend | Lint, Vitest, production frontend build and a generated-module round trip. |
| Deno API | Type checking, API unit tests and zero-configuration `/test`/`/health` boot. |
| Crystal pipeline | Crystal mock → normalization → DuckDB → health counters → Dashboard snapshot. |
| E2E smoke | Login/OTP, Dashboard, phone panel, Calls, Reports and unauthenticated route protection. |
| Production image | Builds `Dockerfile.production`, starts it and probes frontend/API/connector surfaces. |

## Test ownership

| Area | Tests |
|---|---|
| Calls | `src/services/callsApi.test.js`, `src/components/Calls/*.test.*`, browser smoke. |
| Reports | `src/components/Reports/ReportChart.test.js`, browser smoke. |
| Authentication/OTP | Mothership/client unit tests and Playwright OTP scenarios. |
| WebRTC phone | `src/lib/sip/*.test.ts`, resilience context test and integrated phone-panel smoke. |
| Crystal Cable | `api/tests/cable.test.ts`, real-contract fixtures. |
| DuckDB | `api/tests/event_store.test.ts`, Crystal functional Docker test. |
| Health counters | `api/tests/health_freshness.test.ts`, `api/tests/server_routes.test.ts`, Crystal functional test. |
| Optional Influx | `api/tests/influx.test.ts`. |
| Optional PostgREST | `src/lib/clients/postgrest.test.ts` and production surface probe. |

## Crystal functional contract

`scripts/test-crystal-pipeline.sh` builds the API Docker image and emits one
call as three va-crystal-compatible events: ringing, answered and completed.
It verifies:

- three events received, persisted and relayed;
- zero duplicates and persistence failures;
- three DuckDB event rows;
- one answered and completed Dashboard call;
- the expected completed-call duration.

The mock endpoint exists only when `MOCK_CRYSTAL_EVENTS=1`; production cannot
enable it accidentally without explicit configuration.

## Health contract

`GET /health` includes:

```json
{
  "event_pipeline": {
    "received": 0,
    "persisted": 0,
    "duplicates": 0,
    "persistence_failures": 0,
    "relayed": 0
  }
}
```

`checks.event_store.events` reports the stored event count. Cable and optional
connectors report `disabled` rather than failing application startup when they
are intentionally unconfigured.

## What automated tests do not prove

These require credentials and live infrastructure and must not be described as
completed merely because mocks pass:

- a real mothership Calls/Reports query with tenant data;
- a real va-crystal Cable/NATS subscription and sustained reconnect test;
- a real SIP/WSS registration and two-way audio call;
- external notification delivery behavior controlled by the browser/OS.

Run those as environment acceptance tests after configuring the corresponding
services. Never commit their credentials or captured customer call data.

