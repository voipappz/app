import { assertEquals } from '@std/assert';
import { connect } from '@nats-io/transport-deno';
import { createNatsConsumer, safeNatsServer } from '../nats.ts';

Deno.test('redacts NATS credentials from operational output', () => {
  assertEquals(safeNatsServer('nats://internal:secret@nats'), 'nats://nats:4222');
  assertEquals(safeNatsServer('tls://user:secret@nats.example:4443'), 'tls://nats.example:4443');
});

const testUrl = Deno.env.get('NATS_TEST_URL');

Deno.test({
  name: 'one Core NATS connection consumes current and committed CDR subjects and performs replay request/reply',
  ignore: !testUrl,
  async fn() {
    const publisher = await connect({ servers: testUrl!, name: 'voipappz-cdr-test-publisher' });
    let resolveReceived!: (value: string[]) => void;
    const values: string[] = [];
    const received = new Promise<string[]>((resolve) => { resolveReceived = resolve; });
    const consumer = await createNatsConsumer({
      url: testUrl!,
      subjects: ['events.cdr', 'cdr.write.bulk'],
      onMessage: ({ subject, data }) => {
        values.push(`${subject}:${new TextDecoder().decode(data)}`);
        if (values.length === 2) resolveReceived(values);
      },
    });

    try {
      publisher.publish('events.cdr', new TextEncoder().encode('{"event_id":"cdr-1"}'));
      publisher.publish('cdr.write.bulk', new TextEncoder().encode('[{"call_uuid":"call-1"}]'));
      await publisher.flush();
      assertEquals((await received).sort(), [
        'cdr.write.bulk:[{"call_uuid":"call-1"}]',
        'events.cdr:{"event_id":"cdr-1"}',
      ]);
      assertEquals(consumer.ready(), true);

      const replaySubscription = publisher.subscribe('events.cdr.replay', { max: 1 });
      const responder = (async () => {
        for await (const request of replaySubscription) {
          request.respond(new TextEncoder().encode('{"schema":"cdr.replay.v1","caught_up":true}'));
        }
      })();
      await publisher.flush();

      const reply = await consumer.request('events.cdr.replay', '{"after_event_id":null}');
      assertEquals(new TextDecoder().decode(reply.data), '{"schema":"cdr.replay.v1","caught_up":true}');
      await responder;
    } finally {
      await consumer.stop();
      if (!publisher.isClosed()) await publisher.drain();
    }
  },
});
