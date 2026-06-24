import { assertEquals, assertStringIncludes, assertRejects } from "@std/assert";
import { callsPerHourSql, toCallsPerHour, sqlUuidList, runInfluxSql } from "../influx.ts";

// ── sqlUuidList: only valid UUIDs survive (injection guard) ──────────────────
Deno.test("sqlUuidList keeps valid UUIDs, drops junk", () => {
  const out = sqlUuidList([
    "11111111-1111-1111-1111-111111111111",
    "not-a-uuid",
    "'; DROP TABLE cdr;--",
  ]);
  assertEquals(out, "'11111111-1111-1111-1111-111111111111'");
});

// ── callsPerHourSql: shape, defaults, env scoping ────────────────────────────
Deno.test("callsPerHourSql defaults to 1440m, no env clause", () => {
  const sql = callsPerHourSql();
  assertStringIncludes(sql, "FROM \"cdr\"");
  assertStringIncludes(sql, "INTERVAL '1440 minutes'");
  assertStringIncludes(sql, "date_bin(INTERVAL '1 hour'");
  assertStringIncludes(sql, "\"leg_a_type\" <> 'call'");
  assertEquals(sql.includes("environment_uuid"), false);
});

Deno.test("callsPerHourSql honors minutes + env scoping", () => {
  const sql = callsPerHourSql({ minutes: 60, environmentUuids: ["22222222-2222-2222-2222-222222222222"] });
  assertStringIncludes(sql, "INTERVAL '60 minutes'");
  assertStringIncludes(sql, "\"environment_uuid\" IN ('22222222-2222-2222-2222-222222222222')");
});

Deno.test("callsPerHourSql ignores invalid minutes (falls back to 1440)", () => {
  assertStringIncludes(callsPerHourSql({ minutes: -5 }), "INTERVAL '1440 minutes'");
  assertStringIncludes(callsPerHourSql({ minutes: NaN }), "INTERVAL '1440 minutes'");
});

// ── toCallsPerHour: collapse (bucket,direction,calls) → per-hour points ───────
Deno.test("toCallsPerHour merges directions per bucket and sorts", () => {
  const points = toCallsPerHour([
    { bucket: "2026-06-22T10:00:00Z", direction: "inbound", calls: 3 },
    { bucket: "2026-06-22T10:00:00Z", direction: "outbound", calls: 2 },
    { bucket: "2026-06-22T09:00:00Z", direction: "inbound", calls: 5 },
  ]);
  assertEquals(points.length, 2);
  assertEquals(points[0].bucket, "2026-06-22T09:00:00Z"); // sorted ascending
  assertEquals(points[0], { bucket: "2026-06-22T09:00:00Z", inbound: 5, outbound: 0, total: 5 });
  assertEquals(points[1], { bucket: "2026-06-22T10:00:00Z", inbound: 3, outbound: 2, total: 5 });
});

Deno.test("toCallsPerHour maps real cdr vocab (incoming/outgoing)", () => {
  const points = toCallsPerHour([
    { bucket: "2026-06-22T08:00:00", direction: "incoming", calls: 818 },
    { bucket: "2026-06-22T08:00:00", direction: "outgoing", calls: 12 },
  ]);
  assertEquals(points[0], { bucket: "2026-06-22T08:00:00", inbound: 818, outbound: 12, total: 830 });
});

Deno.test("toCallsPerHour tolerates empty/garbage rows", () => {
  assertEquals(toCallsPerHour([]), []);
  assertEquals(toCallsPerHour([{ direction: "inbound", calls: 1 } as any]), []); // no bucket → skipped
});

// ── runInfluxSql: posts to /api/v3/query_sql with Bearer + db, parses rows ───
Deno.test("runInfluxSql posts query_sql and returns rows (mocked fetch)", async () => {
  // INFLUXDB_TOKEN must be set for INFLUX_ENABLED; set before module read? config
  // reads env at import. This test sets it and relies on a fresh process.
  let captured: { url: string; init: RequestInit } | null = null;
  const fakeFetch = ((url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init as RequestInit };
    return Promise.resolve(new Response(
      JSON.stringify([{ bucket: "2026-06-22T10:00:00Z", direction: "inbound", calls: 4 }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
  }) as unknown as typeof fetch;

  // Skip if token isn't configured in this env (INFLUX_ENABLED gate).
  if (!Deno.env.get("INFLUXDB_TOKEN")) {
    await assertRejects(() => runInfluxSql("SELECT 1", { fetchImpl: fakeFetch }), Error, "not configured");
    return;
  }
  const rows = await runInfluxSql("SELECT 1", { fetchImpl: fakeFetch });
  assertEquals(rows.length, 1);
  assertStringIncludes(captured!.url, "/api/v3/query_sql");
  const body = JSON.parse(String(captured!.init.body));
  assertEquals(body.q, "SELECT 1");
});

Deno.test("runInfluxSql throws on HTTP error (mocked 500)", async () => {
  if (!Deno.env.get("INFLUXDB_TOKEN")) return; // gate covered above
  const fakeFetch = (() =>
    Promise.resolve(new Response("boom", { status: 500 }))) as unknown as typeof fetch;
  await assertRejects(() => runInfluxSql("SELECT 1", { fetchImpl: fakeFetch }), Error, "query failed");
});
