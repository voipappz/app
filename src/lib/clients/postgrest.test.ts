import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pgrstList, pgrstGet } from './postgrest';

// The optional PostgREST plane: relative /rest/v1 base (same-origin through the
// Vite proxy / deno forwarder), exact counts via Content-Range, bearer auth.
describe('postgrest client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  const jsonResponse = (body: unknown, { status = 200, headers = {} } = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  it('lists via the relative /rest/v1 base with an exact-count Prefer', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }], { headers: { 'content-range': '0-0/42' } }));
    const { rows, total } = await pgrstList('/calls?select=*&limit=1&offset=0');
    expect(fetchMock).toHaveBeenCalledWith('/rest/v1/calls?select=*&limit=1&offset=0', expect.anything());
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Prefer: 'count=exact' });
    expect(rows).toEqual([{ id: 1 }]);
    expect(total).toBe(42);   // from Content-Range, not rows.length
  });

  it('falls back to rows.length when Content-Range is absent or unbounded', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }, { id: 2 }]));
    expect((await pgrstList('/calls')).total).toBe(2);
    fetchMock.mockResolvedValue(jsonResponse([], { headers: { 'content-range': '*/*' } }));
    expect((await pgrstList('/calls')).total).toBe(0);
  });

  it('throws on non-2xx (e.g. the 503 the forwarder returns when PostgREST is off)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'postgrest not configured' }, { status: 503 }));
    await expect(pgrstList('/calls')).rejects.toThrow('503');
  });

  it('pgrstGet requests a single object', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 7 }));
    expect(await pgrstGet('/calls?id=eq.7')).toEqual({ id: 7 });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Accept: 'application/vnd.pgrst.object+json' });
  });
});
