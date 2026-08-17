import { assertEquals } from "@std/assert";
import { createRequestHandler } from "../server.ts";

Deno.test("PostgREST login is isolated from the mothership /auth namespace", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: true }));
  const response = await handler(new Request(
    "http://localhost/connectors/postgrest/auth/login",
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  ));

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "email and password are required" });
});

Deno.test("browser WebSocket requires an authenticated portal session", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: false, error: "Missing bearer token" }));
  const response = await handler(new Request("http://localhost/ws/events?topics=call.%23", {
    headers: { upgrade: "websocket" },
  }));
  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Missing bearer token" });
});

// Regression: the per-user cable bridge read the caller's token AFTER
// Deno.upgradeWebSocket had taken the request. Touching request.headers past
// that point throws "Request closed", the exception escaped handleWebSocket, and
// the upgrade response was never returned — so EVERY authenticated browser
// socket died: dashboard, call events and notifications alike. Only the
// rejected path was covered, and it returns before upgrading, so nothing caught
// it. Assert the accepted path actually upgrades.
Deno.test("an authenticated browser WebSocket upgrades instead of throwing", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: true }));
  const token = btoa("portal-token").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const response = await handler(new Request("http://localhost/ws/events?topics=%23", {
    headers: {
      upgrade: "websocket",
      connection: "Upgrade",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-version": "13",
      "sec-websocket-protocol": `voipappz-bearer.${token}`,
    },
  }));
  // 101 Switching Protocols — anything else means the upgrade never happened.
  assertEquals(response.status, 101);
  // The private bearer subprotocol must be echoed back: a browser that offered
  // one and gets none selected aborts the connection itself.
  assertEquals(response.headers.get("sec-websocket-protocol"), `voipappz-bearer.${token}`);
});

Deno.test("health exposes Crystal call-event processing counters", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: true }));
  const response = await handler(new Request("http://localhost/health"));
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.event_pipeline, {
    received: 0,
    persisted: 0,
    duplicates: 0,
    persistence_failures: 0,
    relayed: 0,
    websocket_backpressure_drops: 0,
    websocket_oversized_drops: 0,
    dashboard_frames_received: 0,
    dashboard_frames_coalesced: 0,
  });
});

Deno.test("event inspector is absent unless explicitly enabled", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: true }));
  const response = await handler(new Request("http://localhost/events"));
  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "event inspector disabled" });
});

Deno.test("DuckDB MCP route is absent unless explicitly enabled", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: true }), {
    mcpEnabled: false,
  });
  const response = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
    }),
  );
  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "DuckDB MCP disabled" });
});

Deno.test("development DuckDB MCP accepts loopback directly and requires its token remotely", async () => {
  const handler = createRequestHandler(async () => ({ authenticated: true }), {
    mcpEnabled: true,
    mcpAuthToken: "dev-token",
    mcpAllowLocalhostWithoutToken: true,
  });
  const request = () => new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });

  const local = await handler(request(), { remoteAddr: { hostname: "127.0.0.1" } });
  assertEquals(local.status, 200);
  assertEquals(await local.json(), { jsonrpc: "2.0", id: 1, result: {} });

  const remote = await handler(request(), { remoteAddr: { hostname: "192.0.2.10" } });
  assertEquals(remote.status, 401);
  assertEquals(await remote.json(), { error: "Unauthorized" });

  const remoteWithToken = await handler(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer dev-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
  }), { remoteAddr: { hostname: "192.0.2.10" } });
  assertEquals(remoteWithToken.status, 200);
});

Deno.test("event inspector reads its page from DuckDB only", async () => {
  const storedEvent = {
    event_id: "event-1",
    call_id: "call-1",
    event_type: "call.cdr",
    action: "call.cdr",
    occurred_at: "2026-08-10 21:00:00",
    occurred_at_epoch: 1786395600,
    received_at: "2026-08-10 21:00:01",
    payload: { call_id: "call-1", duration: 42 },
    raw_payload: { event_id: "event-1" },
  };
  const handler = createRequestHandler(
    async () => ({ authenticated: true }),
    {
      eventInspectorEnabled: true,
      eventReader: {
        page: async (query) => {
          assertEquals(query, {
            limit: 10,
            offset: 5,
            q: "hangup",
            eventType: "call.cdr",
            action: undefined,
            callId: "call-1",
          });
          return { events: [storedEvent], total: 1 };
        },
      },
    },
  );

  const response = await handler(
    new Request(
      "http://localhost/events?limit=10&offset=5&q=hangup&event_type=call.cdr&call_id=call-1",
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    events: [storedEvent],
    total: 1,
    limit: 10,
    offset: 5,
  });
});

Deno.test("dashboard event views are authenticated and never expose raw payloads", async () => {
  const handler = createRequestHandler(
    async () => ({ authenticated: true }),
    {
      // Builder event views do not depend on the separate operational inspector.
      eventInspectorEnabled: false,
      eventReader: {
        page: async (query) => {
          assertEquals(query, {
            limit: 25, offset: 0, q: undefined,
            eventType: "call.cdr", action: undefined, callId: undefined,
          });
          return {
            total: 1,
            events: [{
              event_id: "event-1", call_id: "call-1", event_type: "call.cdr", action: "call.cdr",
              occurred_at: "2026-08-10 21:00:00", occurred_at_epoch: 1786395600,
              received_at: "2026-08-10 21:00:01", payload: { duration: 42 },
              raw_payload: { secret_upstream_shape: true },
            }],
          };
        },
      },
    },
  );

  const response = await handler(new Request("http://localhost/dashboard/events?limit=25&event_type=call.cdr"));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.total, 1);
  assertEquals(body.events[0].payload, { duration: 42 });
  assertEquals("raw_payload" in body.events[0], false);
});
