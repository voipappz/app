import { assertEquals } from "@std/assert";
import { EventStore, type WidgetDefinition } from "../event_store.ts";

Deno.test("dashboard widget definitions persist and round-trip in DuckDB", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-widgets-" });
  const store = new EventStore(`${dir}/events.duckdb`);

  assertEquals(await store.listWidgets(), []);

  const created = await store.saveWidget({
    uuid: "w1", title: "Answered today", type: "counter", metric: "answered", position: 2,
  } as WidgetDefinition);
  assertEquals(created.metric, "answered");

  await store.saveWidget({ uuid: "w2", title: "Total", type: "counter", metric: "total", position: 1 } as WidgetDefinition);

  const listed = await store.listWidgets();
  assertEquals(listed.map((w) => w.uuid), ["w2", "w1"]); // ordered by position
  assertEquals(listed[1].title, "Answered today");

  // Update replaces in place (same uuid), never duplicates.
  await store.saveWidget({ uuid: "w1", title: "Answered", type: "counter", metric: "answered", position: 2 } as WidgetDefinition);
  const updated = await store.listWidgets();
  assertEquals(updated.length, 2);
  assertEquals(updated[1].title, "Answered");

  assertEquals(await store.deleteWidget("w2"), true);
  assertEquals(await store.deleteWidget("w2"), false);
  assertEquals((await store.listWidgets()).map((w) => w.uuid), ["w1"]);

  await store.close();
});
