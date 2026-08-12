import { connect } from '@nats-io/transport-deno';

const url = Deno.env.get('NATS_TEST_URL');
if (!url) throw new Error('NATS_TEST_URL is required');

const connection = await connect({ servers: url, name: 'voipappz-ci-cdr-write-bulk-publisher' });
const callId = 'ci-live-cdr-call';
const endedAt = Date.parse('2026-08-07T12:01:00Z');
const event = {
  call_uuid: callId,
  data: {
    va_call_uuid: callId,
    va_environment_uuid: 'ci-environment',
    va_call_type: 'outgoing',
    duration: '25',
    billsec: '18',
    caller_id_number: '300',
    destination_number: '400',
    hangup_cause: 'NORMAL_CLEARING',
  },
  metadata: {
    'Event-Name': 'CHANNEL_HANGUP_COMPLETE',
    'Event-Date-Timestamp': String(endedAt * 1000),
    'FreeSWITCH-Hostname': 'act-fs-node-1',
  },
};

// This is the exact wire operation used by va-crystal's CDR batch flusher and
// observed by voipappz-api's Jobs::WriteCDRBulk subscriber.
connection.publish('cdr.write.bulk', new TextEncoder().encode(JSON.stringify([event])));
await connection.flush();
await connection.drain();
console.log(`published cdr.write.bulk call ${callId}`);
