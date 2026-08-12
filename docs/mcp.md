# DuckDB MCP for developers

The Deno API includes a read-only Model Context Protocol server at `POST /mcp`.
It gives MCP-capable IDEs and coding agents direct context from the event rows
this application actually consumed and persisted.

## Data boundary

The MCP implementation receives only three `EventStore` read methods:
`page`, `dashboardSnapshot`, and `stats`. Therefore it:

- reads the local `EVENT_STORE_PATH` DuckDB database only;
- returns the original `raw_payload` alongside Deno's normalized payload;
- cannot call the mothership, NATS, Cable, the transcript engine, or PostgREST;
- cannot insert, update, delete, replay, or publish events; and
- does not offer arbitrary SQL execution.

Raw CDRs can contain phone numbers and tenant metadata. Development Compose
enables the endpoint only for clients whose actual TCP peer is loopback. This
is not based on a forgeable `Host` or forwarding header. Production keeps MCP
off, and every non-loopback client requires a dedicated bearer token.

## Use it in development

Start the normal development stack:

```bash
make dev
```

Development Compose sets `MCP_ENABLED=1` and
`MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN=1`. A host-local MCP client can connect
immediately—no `.env` change or shared development secret is required.

The first `make env`, `make dev`, or `make up` also creates `.mcp.env` with
mode `0600`, prints the generated 64-character token, and loads it into Deno.
The file is git-ignored and is never loaded into the Vite service. First-run
output looks like this:

```text
created private development MCP token: .mcp.env (mode 0600, git-ignored)
MCP token: <generated-64-character-token>
show it again: make mcp-token
```

If the first-run output has scrolled away, retrieve all connection details:

```bash
make mcp-token
```

That command prints the host URL, container URL, token, and complete
`Authorization` header without regenerating or changing the token.

Configure any Streamable HTTP MCP client with:

| Setting | Value |
|---|---|
| Name | `voipappz-duckdb` |
| Transport | Streamable HTTP |
| URL | `http://localhost:4001/mcp` |
| Authentication | None for a client running on this host |

### Container, LAN, or remote clients

Requests whose TCP peer is not loopback are rejected unless a token is
configured. `make dev`/`make up` already generated and loaded it; run
`make mcp-token`, then add the displayed bearer header to the MCP client:

| Setting | Value |
|---|---|
| Header | `Authorization: Bearer <MCP_AUTH_TOKEN>` |

MCP client configuration formats differ. Use the client's HTTP/remote MCP
form and keep the token in its secret or environment-variable facility rather
than committing it to a project file.

The optional `claude` development container receives `MCP_AUTH_TOKEN` from
`.mcp.env` and can reach Deno at
`http://host.docker.internal:4001/mcp`. Other development containers can use
the same URL after receiving the token through a server-side env/secret mount.
Never use a `VITE_*` variable for it.

## Available tools

| Tool | Use |
|---|---|
| `duckdb_events_search` | Page and filter raw events by text, normalized type, producer action, or exact call ID. |
| `duckdb_call_timeline` | Return one call's events oldest-first, including untouched raw payloads. Start here when learning an event contract. |
| `duckdb_dashboard_snapshot` | Compute KPI totals, hourly call buckets, and recent calls for a Unix-time range. |
| `duckdb_event_store_stats` | Show row count, permanent retention, store path, and last received time. |

The server also exposes `duckdb://events/schema` and
`duckdb://events/stats` as MCP resources. Every tool result includes
`source: "duckdb"` so callers can preserve the data-ownership boundary.

## Protocol smoke test

With the development stack running, initialize the stateless server directly
from the host:

```bash
curl http://localhost:4001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1"}}}'
```

Read one generated or captured call:

```bash
curl http://localhost:4001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"duckdb_call_timeline","arguments":{"call_id":"<call-uuid>"}}}'
```

The server is stateless, so clients do not need to retain an MCP session ID.
It accepts MCP protocol versions `2024-11-05`, `2025-03-26`, and
`2025-06-18`, returning the latest supported version when negotiation starts
with another version.

## Verification

`api/tests/mcp.test.ts` covers bearer authentication, the explicit local
development context, origin validation, protocol initialization, advertised
tools/resources, query mapping, raw payloads, chronological timelines, and
invalid arguments. `api/tests/server_routes.test.ts` proves the Deno route
accepts a loopback TCP peer directly, rejects an unauthenticated non-loopback
peer, and accepts that remote peer with the generated bearer token.

`scripts/dev-mcp-token.sh` owns first-run generation and retrieval. It never
overwrites an existing token file and rejects malformed files instead of
silently rotating a credential that developers may already be using.

`make act-api` provides the network acceptance: it generates a complete call
through the real ActionCable client, persists three events in DuckDB, rejects
an unauthenticated MCP request, initializes the MCP server with its bearer
token, and reads the exact ringing, answer, and hangup raw actions through the
timeline tool.

This proves the built-in MCP-to-DuckDB path. It does not expose or validate
production tenant data. Production remains disabled unless an operator sets
`MCP_ENABLED=1` and `MCP_AUTH_TOKEN`; production must never set
`MCP_ALLOW_LOCALHOST_WITHOUT_TOKEN`, because a local reverse proxy would itself
appear as a loopback peer.
