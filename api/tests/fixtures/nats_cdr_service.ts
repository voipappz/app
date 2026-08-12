import { connect } from '@nats-io/transport-deno';

const url = Deno.env.get('NATS_TEST_URL');
if (!url) throw new Error('NATS_TEST_URL is required');

const connection = await connect({ servers: url, name: 'voipappz-ci-cdr-replay-service' });
const subscription = connection.subscribe('events.cdr.replay');
await connection.flush();
const readyFile = Deno.env.get('NATS_FIXTURE_READY_FILE');
if (readyFile) await Deno.writeTextFile(readyFile, 'ready\n');
console.log('CDR replay fixture ready');

for await (const request of subscription) {
  request.respond(new TextEncoder().encode(JSON.stringify({
    schema: 'cdr.replay.v1',
    events: [{
      schema: 'cdr.recorded.v1',
      event_id: '019fdca0-4c80-7000-8000-000000000099',
      event_type: 'EventCdr',
      timestamp: '2026-08-07T12:00:00Z',
      call_id: 'ci-cdr-call',
      data: {
        va_call_uuid: 'ci-cdr-call', duration: '42', billsec: '30',
        direction: 'incoming', caller_id_number: '100', destination_number: '200',
      },
      metadata: { source: 'act-core-nats' },
    }],
    next_after_event_id: '019fdca0-4c80-7000-8000-000000000099',
    head_event_id: '019fdca0-4c80-7000-8000-000000000099',
    has_more: false,
    caught_up: true,
  })));
}
