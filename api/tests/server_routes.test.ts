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
