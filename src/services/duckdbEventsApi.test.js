import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken } from '../lib/auth';
import {
  buildDuckdbEventsQuery,
  getDuckdbEvents,
  normalizeDuckdbEventPage,
} from './duckdbEventsApi';

vi.mock('../lib/auth', () => ({ getToken: vi.fn() }));

describe('DuckDB events API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getToken.mockReturnValue('portal-token');
  });

  it('builds a server-paged filter query', () => {
    const query = new URLSearchParams(buildDuckdbEventsQuery({
      page: 2, perPage: 10, q: 'hangup', eventType: 'call.cdr', action: 'call.cdr', callId: 'call-1',
    }));
    expect(Object.fromEntries(query)).toEqual({
      limit: '10', offset: '20', q: 'hangup', event_type: 'call.cdr', action: 'call.cdr', call_id: 'call-1',
    });
  });

  it('preserves raw DuckDB rows and their total', () => {
    const row = { event_id: 'event-1', raw_payload: { call_uuid: 'call-1' } };
    expect(normalizeDuckdbEventPage({ events: [row], total: 9 })).toEqual({
      rows: [row], total: 9, disabled: false,
    });
  });

  it('sends auth and reports a disabled inspector without treating it as an error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(getDuckdbEvents()).resolves.toEqual({ rows: [], total: 0, disabled: true });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer portal-token' });
  });
});
