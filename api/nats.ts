import { connect, type NatsConnection, type Subscription } from '@nats-io/transport-deno';

export interface NatsMessage {
  subject: string;
  data: Uint8Array<ArrayBufferLike>;
}

export interface NatsConsumerOptions {
  url: string;
  subjects: string[];
  onMessage: (message: NatsMessage) => void | Promise<void>;
  reconnectMs?: number;
  log?: (message: string) => void;
}

export interface NatsConsumer {
  stop(): Promise<void>;
  ready(): boolean;
  request(subject: string, payload: string, timeoutMs?: number): Promise<NatsMessage>;
}

/** Never put NATS credentials into logs or health responses. */
export function safeNatsServer(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.hostname}:${url.port || '4222'}`;
  } catch {
    return 'invalid NATS URL';
  }
}

/**
 * One official Core NATS connection for the configured live CDR subjects and
 * optional EventStore reconciliation requests. The client owns reconnect,
 * ping/pong, authentication, TLS, subscription restoration, and timeouts.
 */
export async function createNatsConsumer(options: NatsConsumerOptions): Promise<NatsConsumer> {
  const log = options.log ?? (() => {});
  const server = safeNatsServer(options.url);
  const subjects = [...new Set(options.subjects.map((subject) => subject.trim()).filter(Boolean))];
  if (subjects.length === 0) throw new Error('at least one NATS subject is required');
  const connection: NatsConnection = await connect({
    servers: options.url,
    name: 'voipappz-event-cdr-consumer',
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: options.reconnectMs ?? 3_000,
    waitOnFirstConnect: true,
  });
  let connected = true;
  let stopped = false;
  const subscriptions: Subscription[] = subjects.map((subject) => connection.subscribe(subject));
  // A successful flush proves the server has processed the SUB before health
  // can turn green or a publisher can race the consumer in tests/startup.
  await connection.flush();

  for (const subscription of subscriptions) {
    void (async () => {
      try {
        for await (const message of subscription) {
          await options.onMessage({ subject: message.subject, data: message.data });
        }
      } catch (error) {
        if (!stopped) log(`nats subscription error: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }

  void (async () => {
    for await (const status of connection.status()) {
      if (status.type === 'disconnect' || status.type === 'reconnecting') connected = false;
      if (status.type === 'reconnect') connected = true;
      log(`nats ${status.type} → ${server}`);
    }
  })();

  void connection.closed().then((error) => {
    connected = false;
    if (error && !stopped) log(`nats closed: ${error.message}`);
  });
  log(`nats connected → ${server} subjects=${subjects.join(',')}`);

  return {
    ready: () => connected && !connection.isClosed(),
    async request(subject: string, payload: string, timeoutMs = 5_000): Promise<NatsMessage> {
      const message = await connection.request(subject, new TextEncoder().encode(payload), { timeout: timeoutMs });
      return { subject: message.subject, data: message.data };
    },
    async stop(): Promise<void> {
      stopped = true;
      connected = false;
      for (const subscription of subscriptions) subscription.unsubscribe();
      if (!connection.isClosed()) await connection.drain();
    },
  };
}
