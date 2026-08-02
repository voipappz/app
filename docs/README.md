# VoIPAppz documentation

This directory is the canonical documentation set for the application. Root
README files are entry points; implementation and operational details belong
here.

| Document | Purpose |
|---|---|
| [architecture.md](architecture.md) | System boundaries, data ownership, authentication and connectors. |
| [modules.md](modules.md) | Complete frontend and backend module inventory. |
| [testing.md](testing.md) | Local tests, GitHub Actions coverage and live acceptance limits. |
| [deployment.md](deployment.md) | Local production image and Kamal deployment workflow. |

## Core decisions

- Calls, Reports, login and feature flags come from the voipappz-api
  mothership. This application does not duplicate that business logic.
- The Dashboard is the local-event surface. It consumes va-crystal Cable
  events, persists only consumed events in DuckDB and projects Dashboard data
  from that local store.
- Cable transports Crystal events over NATS/ActionCable. The browser receives
  normalized events through the local WebSocket relay.
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

