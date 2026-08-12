# Testing and verification

## Required local gates

| Command | Coverage |
|---|---|
| `npm run verify:push` | ESLint, frontend unit tests, Deno check/tests, production build and Playwright end-user smoke. |
| `npm run test:crystal` | Production API image, realistic Crystal lifecycle, DuckDB persistence, health counters and Dashboard projection. |
| `make test-crystal` | Make wrapper for the Crystal functional test. |
| `make act-api` | Exact GitHub Actions Deno/Cable/Core-NATS/DuckDB/MCP job, run locally with an empty env file. |
| `make act` | Complete GitHub Actions workflow locally. |
| `make prod` | Builds/runs the exact local production artifact on port 8000 and probes `/`, `/test` and `/health`. |

The Git pre-push hook runs `npm run verify:push`, so a normal push is rejected
when the core gate fails.

## GitHub Actions

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests.

| Job | What it proves |
|---|---|
| Frontend | Lint, Vitest, production frontend build and a generated-module round trip. |
| Deno API | Type checking, API unit tests, a network-level ActionCable subscription and generated call, token-protected MCP readback from DuckDB, a real va-crystal-shaped `cdr.write.bulk` publication, untouched raw DuckDB inspection, committed-event replay, Dashboard projection, readiness and zero-config boot. |
| Crystal pipeline | Crystal mock → normalization → DuckDB → health counters → Dashboard snapshot. |
| E2E smoke | Login/OTP, Dashboard, phone panel, Calls, Reports, raw-event inspection and unauthenticated route protection. |
| Production image | Builds `Dockerfile.production`, starts it and probes frontend/API/connector surfaces. |

## Test ownership

| Area | Tests |
|---|---|
| Calls | `src/services/callsApi.test.js`, `src/components/Calls/*.test.*`, browser smoke. |
| Reports | `src/components/Reports/ReportChart.test.js`, browser smoke. |
| Authentication/OTP | Mothership/client unit tests and Playwright OTP scenarios. |
| WebRTC phone | `src/lib/sip/*.test.ts`, resilience context test and integrated phone-panel smoke. |
| Crystal Cable | `api/tests/cable.test.ts` plus the live protocol fixture `api/tests/fixtures/cable_service.ts` in the API CI job. |
| Core NATS / CDR | `api/tests/nats.test.ts`, `event_ingestion.test.ts`, `cdr_reconciliation.test.ts` and the API CI service test. |
| DuckDB | `api/tests/event_store.test.ts`, Crystal functional Docker test. |
| DuckDB MCP | `api/tests/mcp.test.ts` plus a token-protected call-timeline read in the API CI job. |
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

## ActionCable CI contract

The API job starts a hermetic network service that implements the ActionCable
WebSocket protocol used by va-crystal. It verifies that Deno:

- sends the configured token and requests the `actioncable-v1-json` subprotocol;
- subscribes to `CallEvents` after the welcome frame and reaches ready state;
- consumes JSON-text ringing, answer and hangup broadcasts;
- preserves all three raw events in DuckDB before relay;
- initializes the built-in MCP server and reads the same three raw actions
  through `duckdb_call_timeline`; and
- projects one answered, completed, 60-second Dashboard call.

This tests the real Deno WebSocket client without using tenant credentials or
depending on a deployed va-crystal instance.

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

Use `/health/live` for process liveness and `/health/ready` for the strict data
gate. With `NATS_URL` configured, readiness requires both a connected Core-NATS
client and a caught-up replay checkpoint. Event freshness can degrade the body
status while `/health` remains HTTP 200.

## Inspecting stored events

Development Compose sets `EVENT_INSPECTOR_ENABLED=1`, so the authenticated
`/event-explorer` page shows the real DuckDB table with server paging, search,
exact filters, and an expandable untouched `raw_payload`. The API is paginated
and searchable:

```bash
curl 'http://localhost:4001/events?limit=25&offset=0'
curl 'http://localhost:4001/events?q=CHANNEL_HANGUP_COMPLETE'
curl 'http://localhost:4001/events?event_type=call.cdr&call_id=<uuid>'
```

Production leaves this route disabled unless explicitly enabled. Treat its
payload as tenant call data; do not publish it in logs or test fixtures.

The MCP surface has the same privacy classification but separate controls.
Development Compose enables tokenless requests only for loopback TCP peers;
remote or production access requires `MCP_ENABLED=1` plus `MCP_AUTH_TOKEN`. Unit
tests prove loopback acceptance and non-loopback rejection. CI separately
proves bearer enforcement and that an authenticated tool call reads the
generated call only from DuckDB. See [mcp.md](mcp.md) for client setup.

First-run onboarding is owned by `scripts/dev-mcp-token.sh`: Make invokes it
before `env`, `dev`, and `up`; it creates a mode-0600 git-ignored `.mcp.env`
once, and `make mcp-token` retrieves the unchanged token and client settings.

The separate `/status` API CDR panel uses the authenticated mothership endpoint
`GET /api/events?event_type=EventCdr`. It is intentionally separate from the
DuckDB panel: upstream rows are displayed but never imported or counted as
locally consumed NATS events. The API scopes results by `customer_uuid`, so an
empty panel can also mean older EventCdr publishers omitted that tenant field.

## What automated tests do not prove

These require credentials and live infrastructure and must not be described as
completed merely because mocks pass:

- a real mothership Calls/Reports query with tenant data;
- the optional deployed voipappz-api `events.cdr` publisher/replay responder
  (the current sibling checkout exposes HTTP EventCdr queries but does not
  implement those NATS subjects); `act` proves that optional consumer with a
  contract fixture and proves the current `cdr.write.bulk` input with its real
  producer shape;
- deployed va-crystal authentication/routing and sustained Cable reconnect;
  `act` proves the network protocol and consumption path against a hermetic
  va-crystal-compatible service, not a production endpoint;
- a real SIP/WSS registration and two-way audio call;
- external notification delivery behavior controlled by the browser/OS.

Run those as environment acceptance tests after configuring the corresponding
services. Never commit their credentials or captured customer call data.
