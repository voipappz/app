import { assertEquals } from "@std/assert";
import { EventStore } from "../event_store.ts";
import {
  createCableClient,
  normalizeCableEvent,
  type WebSocketLike,
} from "../cable.ts";
import { VA_CRYSTAL_CALL_SEQUENCE } from "./fixtures/va_crystal_events.ts";
import { normalizeNatsMessage } from "../event_ingestion.ts";

class FakeCableSocket implements WebSocketLike {
  sent: string[] = [];
  handlers: Record<string, (event: any) => void> = {};
  addEventListener(type: string, callback: (event: any) => void) {
    this.handlers[type] = callback;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.handlers.close?.({});
  }
  frame(value: unknown) {
    this.handlers.message?.({ data: JSON.stringify(value) });
  }
}

async function waitForRows(store: EventStore, count: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await store.list()).length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${count} persisted events`);
}

Deno.test("EventStore persists a Cable event and deduplicates redelivery", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-events-" });
  const store = new EventStore(`${dir}/events.duckdb`);
  try {
    const event = normalizeCableEvent({
      type: "call",
      type_uuid: "call-local-1",
      action: "number.answer",
      created_at: "1700000000",
      metadata: { caller_id_number: "100", user_to: "200", call_type: "inbound" },
    });
    if (!event) throw new Error("fixture did not normalize");

    const first = await store.ingest(event);
    const second = await store.ingest(event);
    const rows = await store.list();

    assertEquals(first.inserted, true);
    assertEquals(second.inserted, false);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].call_id, "call-local-1");
    assertEquals(rows[0].action, "number.answer");
    assertEquals((rows[0].raw_payload as Record<string, unknown>).type, "call");
    assertEquals(rows[0].received_at.length > 0, true);
  } finally {
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("EventStore pages and searches the raw DuckDB rows", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-event-browser-" });
  const store = new EventStore(`${dir}/events.duckdb`);
  try {
    for (const [event] of [
      normalizeNatsMessage("cdr.write.bulk", [{
        call_uuid: "call-search-1", data: { va_call_uuid: "call-search-1", duration: "42" },
        metadata: { "Event-Name": "CHANNEL_HANGUP_COMPLETE", marker: "custom-solution" },
      }]),
      normalizeNatsMessage("events.cdr", {
        schema: "cdr.recorded.v1", event_id: "producer-event-2", event_type: "EventCdr",
        timestamp: "2026-08-07T12:00:00Z", call_id: "call-search-2",
        data: { va_call_uuid: "call-search-2" }, metadata: {},
      }),
    ]) await store.ingest(event);

    const rawMatch = await store.page({ q: "custom-solution", limit: 10 });
    assertEquals(rawMatch.total, 1);
    assertEquals(rawMatch.events[0].call_id, "call-search-1");
    assertEquals(rawMatch.events[0].raw_payload?.call_uuid, "call-search-1");

    const exactMatch = await store.page({ eventType: "call.cdr", callId: "call-search-2", limit: 10 });
    assertEquals(exactMatch.total, 1);
    assertEquals(exactMatch.events[0].event_id, "producer-event-2");
  } finally {
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("EventStore keeps producer IDs and atomically advances the replay checkpoint", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-cdr-replay-" });
  const store = new EventStore(`${dir}/events.duckdb`);
  const event = {
    wsType: "call.cdr",
    wsPayload: { call_id: "call-api-1", duration: "42" },
    occurredAtIso: "2026-08-07T12:00:00.000Z",
    sourceEventId: "019fdca0-4c80-7644-ac73-ee7ba4e90e27",
    raw: { schema: "cdr.recorded.v1" },
  };
  try {
    const first = await store.ingestReplayPage([event], {
      source: "event_cdr", cursorEventId: event.sourceEventId,
      headEventId: event.sourceEventId, caughtUp: true,
    });
    const second = await store.ingestReplayPage([event], {
      source: "event_cdr", cursorEventId: event.sourceEventId,
      headEventId: event.sourceEventId, caughtUp: true,
    });
    assertEquals(first, { inserted: 1, duplicates: 0 });
    assertEquals(second, { inserted: 0, duplicates: 1 });
    assertEquals((await store.list())[0].event_id, event.sourceEventId);
    assertEquals(await store.syncState("event_cdr"), {
      source: "event_cdr",
      cursor_event_id: event.sourceEventId,
      head_event_id: event.sourceEventId,
      caught_up: true,
      last_reconciled_at: (await store.syncState("event_cdr"))?.last_reconciled_at ?? null,
      last_error: null,
    });
    assertEquals((await store.stats()).retention, "forever");
  } finally {
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("committed EventCdr rows project a completed Dashboard call", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-cdr-dashboard-" });
  const store = new EventStore(`${dir}/events.duckdb`);
  const [event] = normalizeNatsMessage("events.cdr", {
    schema: "cdr.recorded.v1",
    event_id: "019fdca0-4c80-7644-ac73-ee7ba4e90e28",
    event_type: "EventCdr",
    timestamp: "2026-08-07T12:00:42Z",
    call_id: "call-api-dashboard-1",
    data: {
      va_call_uuid: "call-api-dashboard-1",
      direction: "outbound",
      caller_id_number: "100",
      destination_number: "200",
      duration: "42",
      billsec: "30",
    },
    metadata: { source: "crystal" },
  });
  try {
    await store.ingest(event);
    const dashboard = await store.dashboardSnapshot(1_786_100_000, 1_786_200_000);
    assertEquals(dashboard.stats, {
      total: 1,
      answered: 1,
      failed: 0,
      inbound: 0,
      outbound: 1,
      avg_duration_sec: 30,
    });
    assertEquals(dashboard.recent_calls[0], {
      id: "call-api-dashboard-1",
      direction: "outbound",
      from_number: "100",
      to_number: "200",
      status: "completed",
      started_at: "2026-08-07T12:00:00.000Z",
      answered_at: "2026-08-07T12:00:12.000Z",
      ended_at: "2026-08-07T12:00:42.000Z",
      duration_sec: 30,
    });
  } finally {
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("simulated va-crystal CallEvents frames are consumed and saved", async () => {
  const dir = await Deno.makeTempDir({ prefix: "voipappz-cable-events-" });
  const store = new EventStore(`${dir}/events.duckdb`);
  let socket!: FakeCableSocket;
  const client = createCableClient({
    url: "ws://va-crystal:4000/cable",
    token: "test-token",
    channel: "CallEvents",
    socketFactory: () => (socket = new FakeCableSocket()),
    onEvent: async (event) => {
      await store.ingest(event);
    },
  });

  try {
    socket.frame({ type: "welcome" });
    const subscribe = JSON.parse(socket.sent[0]);
    assertEquals(subscribe.command, "subscribe");
    assertEquals(JSON.parse(subscribe.identifier), { channel: "CallEvents" });
    socket.frame({ type: "confirm_subscription", identifier: subscribe.identifier });

    for (const event of VA_CRYSTAL_CALL_SEQUENCE) {
      // va-crystal calls Cable.server.publish("call_events", event_record_json),
      // so the real NATS-backed ActionCable data frame carries JSON text here.
      socket.frame({ identifier: subscribe.identifier, message: JSON.stringify(event) });
    }
    // Cable is at-most-once, but duplicate frames can still occur around
    // reconnects. Re-deliver one fixture to lock in idempotent persistence.
    socket.frame({ identifier: subscribe.identifier, message: JSON.stringify(VA_CRYSTAL_CALL_SEQUENCE[1]) });

    await waitForRows(store, VA_CRYSTAL_CALL_SEQUENCE.length);
    const rows = await store.list();
    assertEquals(rows.length, 3);
    assertEquals(rows.map((row) => row.action).sort(), [
      "number.answer",
      "number.hangup",
      "number.ringing",
    ]);
    assertEquals(rows.every((row) => row.call_id === "call-local-1"), true);
    assertEquals(rows[0].raw_payload?.type, "call");

    const dashboard = await store.dashboardSnapshot(1699999900, 1700000200);
    assertEquals(dashboard.stats, {
      total: 1,
      answered: 1,
      failed: 0,
      inbound: 1,
      outbound: 0,
      avg_duration_sec: 60,
    });
    assertEquals(dashboard.calls_per_hour.length, 1);
    assertEquals(dashboard.calls_per_hour[0].total, 1);
    assertEquals(dashboard.recent_calls[0].status, "completed");
    assertEquals(dashboard.recent_calls[0].duration_sec, 60);
  } finally {
    client.stop();
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});
