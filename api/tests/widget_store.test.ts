import { assertEquals } from "@std/assert";
import { EventStore, type WidgetDefinition } from "../event_store.ts";

Deno.test("dashboard widget definitions persist and round-trip in DuckDB", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-widgets-" });
  const store = new EventStore(`${dir}/events.duckdb`);

  assertEquals(await store.listWidgets(), []);

  const created = await store.saveWidget({
    uuid: "w1", dashboard_uuid: "default", title: "Answered today", type: "counter", metric: "answered", position: 2,
  } as WidgetDefinition);
  assertEquals(created.metric, "answered");

  await store.saveWidget({ uuid: "w2", dashboard_uuid: "default", title: "Total", type: "counter", metric: "total", position: 1 } as WidgetDefinition);

  const listed = await store.listWidgets();
  assertEquals(listed.map((w) => w.uuid), ["w2", "w1"]); // ordered by position
  assertEquals(listed[1].title, "Answered today");

  // Update replaces in place (same uuid), never duplicates.
  await store.saveWidget({ uuid: "w1", dashboard_uuid: "default", title: "Answered", type: "counter", metric: "answered", position: 2 } as WidgetDefinition);
  const updated = await store.listWidgets();
  assertEquals(updated.length, 2);
  assertEquals(updated[1].title, "Answered");

  assertEquals(await store.deleteWidget("w2"), true);
  assertEquals(await store.deleteWidget("w2"), false);
  assertEquals((await store.listWidgets()).map((w) => w.uuid), ["w1"]);

  await store.close();
});

Deno.test("dashboard definitions scope widgets and delete together", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-dashboards-" });
  const store = new EventStore(`${dir}/events.duckdb`);

  assertEquals((await store.listDashboards()).map((dashboard) => dashboard.uuid), ["default"]);
  await store.saveDashboard({ uuid: "support", name: "Support", position: 1 });
  assertEquals((await store.listDashboards()).map((dashboard) => dashboard.uuid), ["default", "support"]);

  await store.saveWidget({
    uuid: "support-events", dashboard_uuid: "support", title: "Events",
    type: "event_table", metric: "total", position: 0,
  } as WidgetDefinition);
  assertEquals(await store.listWidgets("default"), []);
  assertEquals((await store.listWidgets("support"))[0].dashboard_uuid, "support");

  assertEquals(await store.deleteDashboard("default"), false);
  assertEquals(await store.deleteDashboard("support"), true);
  assertEquals(await store.listWidgets("support"), []);
  await store.close();
});
