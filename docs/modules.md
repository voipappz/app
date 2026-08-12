# Module inventory

The project uses a feature-module shape:

```text
transport/auth → feature service → feature hook → feature component
```

Components do not construct backend URLs or duplicate backend business rules.
Calls is the reference implementation for new list modules.

## End-user modules

| Module | Main code | Data owner | Responsibility |
|---|---|---|---|
| Login | `src/components/Login/`, `src/lib/auth.ts`, `src/lib/clients/mothership.ts` | Mothership | Password login, optional OTP, trusted session and logout. |
| Calls | `src/components/Calls/`, `src/services/callsApi.js` | Mothership | Server-filtered and paginated call list, details and transcript presentation. |
| Reports | `src/components/Reports/`, `src/services/reportsApi.js` | Mothership | Mature report definitions, date filtering and charts. |
| Dashboard | `src/components/Dashboard/` | Local DuckDB projection | KPIs, calls per hour and recent calls derived only from consumed Crystal events. |
| Phone | `src/components/Phone/`, `src/lib/sip/` | Authenticated user/PBX | SIP registration, presence, inbound/outbound call lifecycle, audio and call notifications. |
| Navigation/Layout | `src/components/MainMenu/`, `src/components/Layout/` | Frontend | End-user menu, responsive hamburger behavior and authenticated layout. |
| Notifications | `src/components/Notifications/` | Frontend | Application notifications and notification state. |
| System status | `src/components/Status/`, `src/components/common/SystemHealth.jsx` | Local API health | Connector and event-pipeline visibility. |
| Raw event explorer | `src/components/EventExplorer/`, `src/services/duckdbEventsApi.js` | Local DuckDB | Server-paged/searchable table and untouched raw JSON inspection for custom solutions. |
| PostgREST table | `src/components/PostgrestTable/`, `src/lib/clients/postgrest.ts` | Optional PostgREST | Reusable server-paged table for tenant-specific data. |

## Shared frontend layers

| Layer | Location | Rule |
|---|---|---|
| Authentication | `src/lib/auth.ts` | One stored session and one source of bearer credentials. |
| API transport | `src/lib/clients/` | Relative same-origin requests, common auth, paging and 401 behavior. |
| Feature services | `src/services/` | Endpoint/query construction and response normalization per feature. |
| Feature hooks | Inside each component folder | Loading, error, paging, sorting and lifecycle state owned by that feature. |
| Shared presentation | `src/components/common/`, `src/components/ui/` | Filters, cards, charts and small presentation primitives only. |
| Access control/features | `src/services/aclService.js`, `src/hooks/` | User permissions and feature flags; inaccessible services degrade safely. |
| Internationalization | `src/i18n/`, direction context | Hebrew/RTL and English copy/layout. |

## Local API modules

| Module | File | Responsibility |
|---|---|---|
| Server/BFF | `api/app.ts`, `api/server.ts` | Static production app, same-origin mothership forwarding, local routes and WebSocket clients. |
| Configuration | `api/config.ts` | Environment decoding; secrets remain server-side. |
| Core NATS | `api/nats.ts` | One reconnecting connection for current `cdr.write.bulk` input and optional committed EventCdr/replay mode. |
| Event ingestion | `api/event_ingestion.ts` | Preserves and normalizes real `cdr.write` rows plus optional committed EventCdr envelopes. |
| CDR reconciliation | `api/cdr_reconciliation.ts` | Ordered replay paging from the last producer event id. |
| Crystal Cable | `api/cable.ts` | Optional DashboardLive/legacy ActionCable subscription and normalization. |
| Event store + Dashboard projection | `api/event_store.ts` | Permanent DuckDB persistence, producer-id deduplication, atomic replay checkpoints and Dashboard snapshots. |
| Crystal mock | `api/mock_crystal_events.ts` | Test-only ringing, answered and completed frames matching va-crystal's contract. |
| Event freshness | `api/health_freshness.ts` | Disabled, idle, current and stale active-source health states. |
| Event inspector | `GET /events`, `src/components/EventExplorer/` | Opt-in filtered/paginated read-only view of DuckDB rows and raw payloads; enabled in development Compose. |
| DuckDB MCP | `api/mcp.ts`, `POST /mcp` | Read-only MCP tools/resources over the local event store; loopback-only by default in development, token-protected elsewhere, with no upstream or event-transport access. |
| Engine connector | `api/engine.ts` | Optional authenticated transcript reads; no local transcript/log duplication. |
| Influx connector | `api/influx.ts` | Optional tenant analytics retained for later use. |
| PostgREST connector | API routes plus frontend client | Optional tenant-custom relational data plane. |

## Data ownership

| Data | Source of truth | Stored locally? |
|---|---|---|
| Users, authentication and OTP | Mothership | Session only in the browser. |
| Calls list and call metadata | Mothership | No. |
| Reports and report definitions | Mothership | No. |
| Transcripts/logs | Engine/mothership service | No; read on demand. |
| CDR events received by this app | Current va-crystal bulk input; optional committed API stream/replay | Yes, permanently in DuckDB with the original raw row. |
| DashboardLive values | va-crystal via Cable | Runtime relay only. |
| Dashboard projections | Consumed local events | Derived in DuckDB. |
| SIP credentials/settings | Authenticated user payload | Runtime only. |

## Adding a future module

Use the generator to create the standard service, test, hook and page shape:

```bash
make module NAME=Agent ENDPOINT=/api/agents
```

Then add the route and navigation item printed by the generator, replace its
placeholder normalization/columns, add filters using the shared filter model,
and extend the browser smoke test. The generator never overwrites an existing
module.

Webhooks are deliberately not generated now. If added later, keep their
configuration UI separate from call processing and support transport-specific
adapters without coupling Calls, Reports or Dashboard to webhook logic.
