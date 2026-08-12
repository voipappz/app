import { assertEquals } from '@std/assert';
import { canSendRealtime, createCoalescingRelay } from '../realtime_relay.ts';

Deno.test('canSendRealtime rejects closed or backed-up browser sockets', () => {
  const socket = { readyState: 1, bufferedAmount: 0, send: () => {} };
  assertEquals(canSendRealtime(socket, 1024), true);
  assertEquals(canSendRealtime({ ...socket, bufferedAmount: 1025 }, 1024), false);
  assertEquals(canSendRealtime({ ...socket, readyState: 0 }, 1024), false);
});

Deno.test('createCoalescingRelay bounds a burst and keeps the latest value per widget', () => {
  const scheduled: Array<() => void> = [];
  const delivered: Array<Record<string, number>> = [];
  const relay = createCoalescingRelay<Record<string, number>>(
    (value) => delivered.push(value),
    (pending, next) => ({ ...pending, ...next }),
    250,
    (callback) => scheduled.push(callback),
  );

  assertEquals(relay.push({ agents: 1 }), false);
  assertEquals(relay.push({ queues: 2 }), true);
  assertEquals(relay.push({ agents: 3 }), true);
  assertEquals(scheduled.length, 1);
  assertEquals(delivered, []);

  scheduled.shift()?.();
  assertEquals(delivered, [{ agents: 3, queues: 2 }]);

  assertEquals(relay.push({ calls: 4 }), false);
  assertEquals(scheduled.length, 1);
});
