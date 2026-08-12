import { assertEquals, assertRejects } from '@std/assert';
import { CDR_SYNC_SOURCE, reconcileEventCdr } from '../cdr_reconciliation.ts';
import { EventStore } from '../event_store.ts';

function envelope(id: string, callId: string) {
  return {
    schema: 'cdr.recorded.v1', event_id: id, event_type: 'EventCdr',
    timestamp: '2026-08-07T12:00:00Z', call_id: callId,
    data: { va_call_uuid: callId, duration: '42' }, metadata: { source: 'test' },
  };
}

Deno.test('reconciliation recovers a live Core NATS event that was missed', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'voipappz-reconcile-' });
  const store = new EventStore(`${dir}/events.duckdb`);
  const ids = ['019fdca0-4c80-7000-8000-000000000001', '019fdca0-4c80-7000-8000-000000000002'];
  const requests: Array<string | null> = [];
  try {
    const result = await reconcileEventCdr(store, async ({ after_event_id }) => {
      requests.push(after_event_id);
      if (!after_event_id) return {
        schema: 'cdr.replay.v1', events: [envelope(ids[0], 'call-1')],
        next_after_event_id: ids[0], head_event_id: ids[1], has_more: true, caught_up: false,
      };
      return {
        schema: 'cdr.replay.v1', events: [envelope(ids[1], 'call-2')],
        next_after_event_id: ids[1], head_event_id: ids[1], has_more: false, caught_up: true,
      };
    }, { pageSize: 1 });

    assertEquals(requests, [null, ids[0]]);
    assertEquals(result, {
      pages: 2, inserted: 2, duplicates: 0,
      cursor_event_id: ids[1], head_event_id: ids[1], caught_up: true,
    });
    assertEquals((await store.list()).map((row) => row.event_id).sort(), ids);
    assertEquals((await store.syncState(CDR_SYNC_SOURCE))?.caught_up, true);
  } finally {
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('reconciliation refuses to advance past an invalid event', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'voipappz-reconcile-invalid-' });
  const store = new EventStore(`${dir}/events.duckdb`);
  try {
    await assertRejects(() => reconcileEventCdr(store, async () => ({
      schema: 'cdr.replay.v1', events: [{ schema: 'cdr.recorded.v1' }],
      next_after_event_id: 'bad', head_event_id: 'bad', has_more: false, caught_up: true,
    })), Error, 'invalid event');
    assertEquals(await store.syncState(CDR_SYNC_SOURCE), null);
  } finally {
    await store.close();
    await Deno.remove(dir, { recursive: true });
  }
});
