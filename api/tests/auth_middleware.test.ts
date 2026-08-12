import { assertEquals } from '@std/assert';
import { createJwtVerifier } from '../auth_middleware.ts';

Deno.test('mothership verifier preserves zero-config local API behavior', async () => {
  const verifier = createJwtVerifier({ engineUrl: '' });
  assertEquals(await verifier(new Request('http://local/events')), {
    authenticated: false,
    error: 'Auth not configured',
  });
});

Deno.test('mothership verifier accepts bearer and WebSocket protocol tokens with a bounded cache', async () => {
  let calls = 0;
  const verifier = createJwtVerifier({
    engineUrl: 'https://engine.example',
    now: () => 1000,
    fetcher: (_input, init) => {
      calls++;
      assertEquals(new Headers(init?.headers).get('authorization'), 'Bearer good');
      return Promise.resolve(new Response('{}', { status: 200 }));
    },
  });

  assertEquals(await verifier(new Request('http://local/dashboard', {
    headers: { authorization: 'Bearer good' },
  })), { authenticated: true });
  assertEquals(await verifier(new Request('http://local/ws/events', {
    headers: { 'sec-websocket-protocol': 'voipappz-bearer.Z29vZA' },
  })), { authenticated: true });
  assertEquals(calls, 1);
});

Deno.test('mothership verifier rejects missing and invalid tokens', async () => {
  const verifier = createJwtVerifier({
    engineUrl: 'https://engine.example',
    fetcher: () => Promise.resolve(new Response('{}', { status: 401 })),
  });
  assertEquals(await verifier(new Request('http://local/ws/events')), {
    authenticated: false,
    error: 'Missing bearer token',
  });
  assertEquals(await verifier(new Request('http://local/ws/events', {
    headers: { 'sec-websocket-protocol': 'voipappz-bearer.YmFk' },
  })), {
    authenticated: false,
    error: 'Invalid bearer token',
  });
  // Query tokens are never accepted on ordinary HTTP routes.
  assertEquals(await verifier(new Request('http://local/events', {
    headers: { 'sec-websocket-protocol': 'voipappz-bearer.YmFk' },
  })), {
    authenticated: false,
    error: 'Missing bearer token',
  });
});
