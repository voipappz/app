import { afterEach, describe, expect, it } from 'vitest';
import { saveSession } from '../../lib/auth';
import { eventsWsProtocols, eventsWsUrl } from './useCalls';

afterEach(() => localStorage.clear());

describe('eventsWsUrl', () => {
  it('scopes topics and authenticates the browser WebSocket handshake', () => {
    saveSession({ access: 'portal-token', email: 'user@example.com', user_uuid: 'u1' });
    const url = new URL(eventsWsUrl('dashboard.#'));
    expect(url.pathname).toBe('/ws/events');
    expect(url.searchParams.get('topics')).toBe('dashboard.#');
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(eventsWsProtocols()).toEqual(['voipappz-bearer.cG9ydGFsLXRva2Vu']);
  });

  it('never invents a token for a signed-out browser', () => {
    const url = new URL(eventsWsUrl('call.#'));
    expect(url.searchParams.get('topics')).toBe('call.#');
    expect(eventsWsProtocols()).toEqual([]);
  });
});
