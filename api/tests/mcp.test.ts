import { assertEquals, assertStringIncludes } from "@std/assert";
import { createDuckDbMcpHandler, type DuckDbMcpReader } from "../mcp.ts";

const storedEvents = [
  {
    event_id: "event-hangup",
    call_id: "call-1",
    event_type: "call.completed",
    action: "number.hangup",
    occurred_at: "2026-08-11 10:02:00",
    occurred_at_epoch: 1786442520,
    received_at: "2026-08-11 10:02:01",
    payload: { call_id: "call-1" },
    raw_payload: { action: "number.hangup", type_uuid: "call-1" },
  },
  {
    event_id: "event-ringing",
    call_id: "call-1",
    event_type: "call.ringing",
    action: "number.ringing",
    occurred_at: "2026-08-11 10:00:00",
    occurred_at_epoch: 1786442400,
    received_at: "2026-08-11 10:00:01",
    payload: { call_id: "call-1" },
    raw_payload: { action: "number.ringing", type_uuid: "call-1" },
  },
];

function fixtureReader(onPage?: (query: unknown) => void): DuckDbMcpReader {
  return {
    page: (query) => {
      onPage?.(query);
      return Promise.resolve({ events: storedEvents, total: 2 });
    },
    dashboardSnapshot: () =>
      Promise.resolve({
        stats: {
          total: 1,
          answered: 1,
          failed: 0,
          inbound: 1,
          outbound: 0,
          avg_duration_sec: 60,
        },
        calls_per_hour: [],
        recent_calls: [],
      }),
    stats: () =>
      Promise.resolve({
        status: "up",
        path: "/data/events.duckdb",
        retention: "forever",
        events: 2,
        last_received_at: "2026-08-11 10:02:01",
      }),
  };
}

function mcpRequest(
  method: string,
  params?: unknown,
  headers: HeadersInit = {},
): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });
}

Deno.test("DuckDB MCP requires its dedicated bearer token and same origin", async () => {
  const handler = createDuckDbMcpHandler(fixtureReader(), {
    authToken: "test-token",
  });
  const unauthorized = await handler(
    new Request("http://localhost/mcp", { method: "POST" }),
  );
  assertEquals(unauthorized.status, 401);

  const forbidden = await handler(
    mcpRequest("ping", undefined, { origin: "https://attacker.example" }),
  );
  assertEquals(forbidden.status, 403);
});

Deno.test("DuckDB MCP accepts the server's explicit loopback-development context", async () => {
  const handler = createDuckDbMcpHandler(fixtureReader(), { authToken: "" });
  const request = () => new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });

  assertEquals((await handler(request())).status, 503);
  const local = await handler(request(), { allowUnauthenticated: true });
  assertEquals(local.status, 200);
  assertEquals(await local.json(), { jsonrpc: "2.0", id: 1, result: {} });
});

Deno.test("DuckDB MCP initializes and advertises read-only tools and resources", async () => {
  const handler = createDuckDbMcpHandler(fixtureReader(), {
    authToken: "test-token",
    serverVersion: "test",
  });
  const initialized = await handler(mcpRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  }));
  const initBody = await initialized.json();
  assertEquals(initBody.result.protocolVersion, "2025-03-26");
  assertEquals(initBody.result.serverInfo, {
    name: "voipappz-duckdb",
    version: "test",
  });

  const listed = await handler(mcpRequest("tools/list"));
  const listBody = await listed.json();
  assertEquals(
    listBody.result.tools.map((tool: { name: string }) => tool.name),
    [
      "duckdb_events_search",
      "duckdb_call_timeline",
      "duckdb_dashboard_snapshot",
      "duckdb_event_store_stats",
    ],
  );

  const resource = await handler(
    mcpRequest("resources/read", { uri: "duckdb://events/schema" }),
  );
  const resourceBody = await resource.json();
  assertStringIncludes(
    resourceBody.result.contents[0].text,
    "raw_payload JSON: untouched object",
  );
  assertStringIncludes(
    resourceBody.result.contents[0].text,
    "never queries the mothership",
  );
});

Deno.test("DuckDB MCP maps event search filters without another data source", async () => {
  let actualQuery: unknown;
  const handler = createDuckDbMcpHandler(
    fixtureReader((query) => actualQuery = query),
    { authToken: "test-token" },
  );
  const response = await handler(mcpRequest("tools/call", {
    name: "duckdb_events_search",
    arguments: {
      q: "hangup",
      event_type: "call.completed",
      action: "number.hangup",
      call_id: "call-1",
      limit: 10,
      offset: 5,
    },
  }));
  const body = await response.json();

  assertEquals(actualQuery, {
    q: "hangup",
    eventType: "call.completed",
    action: "number.hangup",
    callId: "call-1",
    limit: 10,
    offset: 5,
  });
  assertEquals(body.result.structuredContent.source, "duckdb");
  assertEquals(
    body.result.structuredContent.events[0].raw_payload.action,
    "number.hangup",
  );
});

Deno.test("DuckDB MCP returns a chronological call timeline and validates arguments", async () => {
  const handler = createDuckDbMcpHandler(fixtureReader(), {
    authToken: "test-token",
  });
  const response = await handler(mcpRequest("tools/call", {
    name: "duckdb_call_timeline",
    arguments: { call_id: "call-1" },
  }));
  const body = await response.json();
  assertEquals(
    body.result.structuredContent.events.map((event: { action: string }) =>
      event.action
    ),
    [
      "number.ringing",
      "number.hangup",
    ],
  );
  assertEquals(body.result.structuredContent.order, "oldest_first");

  const invalid = await handler(mcpRequest("tools/call", {
    name: "duckdb_call_timeline",
    arguments: {},
  }));
  const invalidBody = await invalid.json();
  assertEquals(invalidBody.result.isError, true);
  assertEquals(invalidBody.result.content[0].text, "call_id is required");
});

Deno.test("DuckDB MCP dashboard and stats tools stay on the injected DuckDB reader", async () => {
  const reader = fixtureReader();
  let snapshotArgs: unknown;
  reader.dashboardSnapshot = (from, to, recentLimit) => {
    snapshotArgs = { from, to, recentLimit };
    return Promise.resolve({
      stats: {
        total: 1,
        answered: 1,
        failed: 0,
        inbound: 1,
        outbound: 0,
        avg_duration_sec: 60,
      },
      calls_per_hour: [],
      recent_calls: [],
    });
  };
  const handler = createDuckDbMcpHandler(reader, { authToken: "test-token" });

  const snapshot = await handler(mcpRequest("tools/call", {
    name: "duckdb_dashboard_snapshot",
    arguments: { from_epoch: 100, to_epoch: 200, recent_limit: 5 },
  }));
  const snapshotBody = await snapshot.json();
  assertEquals(snapshotArgs, { from: 100, to: 200, recentLimit: 5 });
  assertEquals(snapshotBody.result.structuredContent.source, "duckdb");
  assertEquals(snapshotBody.result.structuredContent.stats.total, 1);

  const stats = await handler(mcpRequest("tools/call", {
    name: "duckdb_event_store_stats",
    arguments: {},
  }));
  const statsBody = await stats.json();
  assertEquals(statsBody.result.structuredContent, {
    status: "up",
    path: "/data/events.duckdb",
    retention: "forever",
    events: 2,
    last_received_at: "2026-08-11 10:02:01",
    source: "duckdb",
  });
});
