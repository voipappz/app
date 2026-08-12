import { assertEquals } from '@std/assert';
import { normalizeNatsMessage } from '../event_ingestion.ts';
import { mockNatsEventSequence } from '../mock_nats_events.ts';

Deno.test('normalizes va-crystal node event using the Cable contract', () => {
  const events = normalizeNatsMessage('node.node-1', JSON.stringify({
    type: 'call', type_uuid: 'call-1', action: 'number.answer', created_at: '1700000000',
    metadata: { caller_id_number: '+100', user_to: '1001', call_type: 'inbound' },
  }));
  assertEquals(events.length, 1);
  assertEquals(events[0].wsType, 'call.answered');
  assertEquals(events[0].wsPayload.call_id, 'call-1');
});

Deno.test('normalizes committed voipappz-api EventCdr and preserves its event_id', () => {
  const events = normalizeNatsMessage('events.cdr', JSON.stringify({
    schema: 'cdr.recorded.v1',
    event_id: '019fdca0-4c80-7644-ac73-ee7ba4e90e27',
    event_type: 'EventCdr',
    timestamp: '2026-08-07T12:00:00Z',
    call_id: 'call-api-1',
    data: { va_call_uuid: 'call-api-1', duration: '42', direction: 'outbound' },
    metadata: { source: 'crystal' },
  }));
  assertEquals(events.length, 1);
  assertEquals(events[0].sourceEventId, '019fdca0-4c80-7644-ac73-ee7ba4e90e27');
  assertEquals(events[0].wsType, 'call.cdr');
  assertEquals(events[0].wsPayload.call_id, 'call-api-1');
  assertEquals(events[0].occurredAtIso, '2026-08-07T12:00:00.000Z');
});

Deno.test('normalizes cdr.write.bulk entries into call events', () => {
  const events = normalizeNatsMessage('cdr.write.bulk', JSON.stringify([{
    call_uuid: 'call-9',
    data: { duration: '42', direction: 'outbound' },
    metadata: {
      'Event-Name': 'CHANNEL_HANGUP_COMPLETE',
      'Event-Date-Timestamp': '1700000042000000',
    },
  }]));
  assertEquals(events.length, 1);
  assertEquals(events[0].wsType, 'call.cdr');
  assertEquals(events[0].wsPayload.call_id, 'call-9');
  assertEquals(events[0].wsPayload.duration, '42');
  assertEquals(events[0].wsPayload.metadata, {
    'Event-Name': 'CHANNEL_HANGUP_COMPLETE',
    'Event-Date-Timestamp': '1700000042000000',
  });
  assertEquals(events[0].occurredAtIso, '2023-11-14T22:14:02.000Z');
});

Deno.test('normalizes the legacy single cdr.write row with the same contract', () => {
  const [event] = normalizeNatsMessage('cdr.write', {
    call_uuid: 'call-single',
    data: { va_call_uuid: 'call-single', end_epoch: '1700000042' },
    metadata: { 'Event-Name': 'CHANNEL_HANGUP_COMPLETE' },
  });
  assertEquals(event.wsType, 'call.cdr');
  assertEquals(event.wsPayload.call_id, 'call-single');
  assertEquals(event.occurredAtIso, '2023-11-14T22:14:02.000Z');
  assertEquals(event.raw?.call_uuid, 'call-single');
});

Deno.test('rejects malformed or incomplete NATS payloads', () => {
  assertEquals(normalizeNatsMessage('cdr.write.bulk', 'not-json'), []);
  assertEquals(normalizeNatsMessage('cdr.write.bulk', JSON.stringify([{ data: {} }])), []);
  assertEquals(normalizeNatsMessage('node.node-1', JSON.stringify({ type: 'call' })), []);
  assertEquals(normalizeNatsMessage('events.cdr', JSON.stringify({ schema: 'cdr.recorded.v1' })), []);
});

Deno.test('mock NATS sequence covers realtime events and the final CDR', () => {
  const mock = mockNatsEventSequence(1_700_000_000);
  const realtime = mock.realtime.flatMap((event) => normalizeNatsMessage('node.mock-1', event));
  const cdr = normalizeNatsMessage('cdr.write.bulk', JSON.stringify(mock.cdr));
  assertEquals(realtime.map((event) => event.wsType), ['call.ringing', 'call.answered', 'call.completed']);
  assertEquals(cdr[0].wsType, 'call.cdr');
  assertEquals(cdr[0].wsPayload.call_id, 'mock-nats-call-1');
  assertEquals(cdr[0].raw?.metadata, {
    'Event-Name': 'CHANNEL_HANGUP_COMPLETE',
    'Event-Date-Timestamp': '1700000065000000',
    'FreeSWITCH-Hostname': 'mock-fs-node-1',
  });
});
