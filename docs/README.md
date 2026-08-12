# VoIPAppz documentation

This directory is the canonical documentation set for the application. Root
README files are entry points; implementation and operational details belong
here.

| Document | Purpose |
|---|---|
| [architecture.md](architecture.md) | System boundaries, data ownership, authentication and connectors. |
| [modules.md](modules.md) | Complete frontend and backend module inventory. |
| [testing.md](testing.md) | Local tests, GitHub Actions coverage and live acceptance limits. |
| [mcp.md](mcp.md) | Connect developer tools to the read-only local DuckDB MCP server. |
| [deployment.md](deployment.md) | Local production image and Kamal deployment workflow. |

## Core decisions

- Calls, Reports, login and feature flags come from the voipappz-api
  mothership. This application does not duplicate that business logic.
- The Dashboard and Raw event explorer are local-event surfaces. The current
  source is va-crystal's `cdr.write.bulk` input—the same batch the API turns
  into EventCdr. Deno preserves the original row in DuckDB and projects the
  Dashboard from that store.
- Optional committed `events.cdr` deployments add producer IDs and request/reply
  reconciliation on `events.cdr.replay`. JetStream is deliberately not used.
- Cable remains optional for `DashboardLive` agent/extension values and as the
  legacy call-event fallback when `NATS_URL` is unset.
- MCP is read-only and backed exclusively by local DuckDB. Development Compose
  enables loopback-only access; remote access needs a dedicated bearer token,
  and production is disabled by default.
- InfluxDB and PostgREST remain optional connectors. Neither is required by
  the current Dashboard.
- SIP/WebRTC settings come from the authenticated user's extension and
  environment. No production PBX endpoint is hard-coded.
- Webhooks are a possible future module and are not part of the current scope.

## Current verification status

The checked-in gate covers frontend unit tests, Deno tests, production build
and end-user browser smoke tests. A separate functional test builds the API
image and verifies Crystal mock events through normalization, DuckDB,
`/health` counters and the Dashboard snapshot. See [testing.md](testing.md).
