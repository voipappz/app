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
  });
});
