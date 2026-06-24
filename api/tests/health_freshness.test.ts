import { assertEquals } from "@std/assert";
import { eventFreshness } from "../health_freshness.ts";

const NOW = 1_000_000_000_000; // fixed epoch ms

Deno.test("eventFreshness — cable disabled → disabled, no timestamps", () => {
  const f = eventFreshness(123, NOW, 900, false);
  assertEquals(f.status, "disabled");
  assertEquals(f.last_event_at, null);
  assertEquals(f.age_seconds, null);
});

Deno.test("eventFreshness — never received → idle", () => {
  const f = eventFreshness(null, NOW, 900, true);
  assertEquals(f.status, "idle");
  assertEquals(f.last_event_at, null);
  assertEquals(f.age_seconds, null);
});

Deno.test("eventFreshness — recent event → up with age + iso", () => {
  const f = eventFreshness(NOW - 30_000, NOW, 900, true);
  assertEquals(f.status, "up");
  assertEquals(f.age_seconds, 30);
  assertEquals(f.last_event_at, new Date(NOW - 30_000).toISOString());
});

Deno.test("eventFreshness — past threshold → stale", () => {
  const f = eventFreshness(NOW - 1_200_000, NOW, 900, true); // 1200s > 900s
  assertEquals(f.status, "stale");
  assertEquals(f.age_seconds, 1200);
});

Deno.test("eventFreshness — threshold 0 disables verdict but still reports age", () => {
  const f = eventFreshness(NOW - 99_999_000, NOW, 0, true);
  assertEquals(f.status, "up");          // no stale verdict when disabled
  assertEquals(f.age_seconds, 99_999);   // age still reported
});

Deno.test("eventFreshness — clock skew (future last) clamps age to 0", () => {
  const f = eventFreshness(NOW + 5_000, NOW, 900, true);
  assertEquals(f.status, "up");
  assertEquals(f.age_seconds, 0);
});

Deno.test("eventFreshness — exactly at threshold is still up (boundary)", () => {
  const f = eventFreshness(NOW - 900_000, NOW, 900, true); // age == threshold
  assertEquals(f.status, "up");
});
