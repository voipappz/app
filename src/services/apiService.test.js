import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService } from './apiService';

// handleResponse is the single place every HTTP status becomes a thrown Error.
// Callers discriminate on `error.status` — nodesApi falls back to a legacy read
// on 404/405 and must NOT retry a 401 — so the status has to survive the throw.
const fakeResponse = (status, body = '') => ({
  status,
  headers: { get: () => null },
  json: async () => JSON.parse(body || '{}'),
  text: async () => body,
});

describe('apiService.handleResponse — error.status', () => {
  beforeEach(() => {
    apiService.authInitializing = false;
    apiService.authContextLogout = null;
    apiService.errorHandler = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stamps 401 so callers can tell auth failure from a missing route', async () => {
    await expect(apiService.handleResponse(fakeResponse(401), 'ctx', false))
      .rejects.toMatchObject({ status: 401 });
  });

  it('stamps 404 — the "this API is too old" signal', async () => {
    await expect(apiService.handleResponse(fakeResponse(404, 'not found'), 'ctx', false))
      .rejects.toMatchObject({ status: 404 });
  });

  it('stamps 405', async () => {
    await expect(apiService.handleResponse(fakeResponse(405, 'nope'), 'ctx', false))
      .rejects.toMatchObject({ status: 405 });
  });

  // handleResponse deliberately has NO side effects on 401 any more -- #fetch
  // owns recovery, so that one expired token is one refresh and at most one
  // logout, not one of each per in-flight request.
  it('does not log out from handleResponse — #fetch decides', async () => {
    const logout = vi.fn();
    apiService.authContextLogout = logout;

    await expect(apiService.handleResponse(fakeResponse(401), 'ctx', false)).rejects.toThrow();

    expect(logout).not.toHaveBeenCalled();
  });

  it('marks the 401 as recoverable so #fetch knows to try a refresh', async () => {
    await expect(apiService.handleResponse(fakeResponse(401), 'ctx', false))
      .rejects.toMatchObject({ status: 401, canRetryAfterRefresh: true });
  });
});

// The production symptom: AuthContext refreshes 5 minutes before expiry via
// setTimeout, which does not survive a backgrounded or suspended tab. A user
// returning to an open dashboard had every panel 401 at once and was thrown to
// the login screen -- with a valid 7-day refresh token sitting unused.
describe('apiService.fetch — 401 recovery', () => {
  let logout;

  const respond = (status, body = {}) => ({
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  beforeEach(() => {
    logout = vi.fn();
    apiService.authInitializing = false;
    apiService.authContextLogout = logout;
    apiService.refreshHandler = null;
    apiService.refreshInFlight = null;
    apiService.pendingRequests.clear();
    apiService.postRefreshRejections.clear();
    apiService.clearCache?.();
    apiService.rateLimitConfig.minRequestInterval = 0;
    vi.spyOn(apiService, 'getToken').mockReturnValue('tok');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('refreshes and replays the request instead of logging out', async () => {
    const refresh = vi.fn(async () => true);
    apiService.setRefreshHandler(refresh);

    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++call === 1 ? respond(401) : respond(200, { ok: 1 }))));

    const result = await apiService.fetch('/api/nodes', {}, 'nodes', false, 0, true);

    expect(result).toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
    expect(call).toBe(2);              // the replay actually went out
  });

  it('does not let an empty caller auth header overwrite the stored token', async () => {
    const fetchSpy = vi.fn(async () => respond(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchSpy);

    await apiService.fetch(
      '/api/events/stats',
      { headers: { Authorization: '' } },
      'events badge',
      false,
      0,
      true
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' })
      })
    );
  });

  it('omits Authorization instead of sending an empty header without a token', async () => {
    apiService.getToken.mockReturnValue(null);
    const fetchSpy = vi.fn(async () => respond(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchSpy);

    await apiService.fetch('/health', {}, 'health', false, 0, true);

    const requestOptions = fetchSpy.mock.calls[0][1];
    expect(requestOptions.headers).not.toHaveProperty('Authorization');
  });

  // The Nodes panel polls an endpoint that 401s for its own reasons. Refreshing
  // proves the session is good; the endpoint still says no. That must not wipe
  // localStorage for the whole app.
  it('does not log out when a refreshed token is still refused by one endpoint', async () => {
    const refresh = vi.fn(async () => true);
    apiService.setRefreshHandler(refresh);

    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { call++; return respond(401); }));

    await expect(apiService.fetch('/tasks/nodes', {}, 'fallback nodes', false, 0, true))
      .rejects.toMatchObject({ status: 401 });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(call).toBe(2);              // original + one replay, then it stops
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out once when the refresh itself fails', async () => {
    apiService.setRefreshHandler(vi.fn(async () => false));
    vi.stubGlobal('fetch', vi.fn(async () => respond(401)));

    await expect(apiService.fetch('/api/nodes', {}, 'nodes', false, 0, true))
      .rejects.toMatchObject({ status: 401 });

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('logs out rather than looping once a SECOND endpoint also rejects the refreshed token', async () => {
    apiService.setRefreshHandler(vi.fn(async () => true));
    const spy = vi.fn(async () => respond(401));
    vi.stubGlobal('fetch', spy);

    await expect(apiService.fetch('/api/nodes', {}, 'nodes', false, 0, true))
      .rejects.toMatchObject({ status: 401 });
    expect(logout).not.toHaveBeenCalled();      // one endpoint is not a dead session

    await expect(apiService.fetch('/api/calls', {}, 'calls', false, 0, true))
      .rejects.toMatchObject({ status: 401 });

    expect(logout).toHaveBeenCalledTimes(1);    // everything refuses -> session is gone
  });

  it('forgets earlier rejections once a request succeeds', async () => {
    apiService.setRefreshHandler(vi.fn(async () => true));

    vi.stubGlobal('fetch', vi.fn(async () => respond(401)));
    await expect(apiService.fetch('/tasks/nodes', {}, 'nodes', false, 0, true))
      .rejects.toMatchObject({ status: 401 });

    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { ok: 1 })));
    await apiService.fetch('/api/calls', {}, 'calls', false, 0, true);

    vi.stubGlobal('fetch', vi.fn(async () => respond(401)));
    await expect(apiService.fetch('/api/devices', {}, 'extensions', false, 0, true))
      .rejects.toMatchObject({ status: 401 });

    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out immediately when no refresh handler is wired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(401)));

    await expect(apiService.fetch('/api/nodes', {}, 'nodes', false, 0, true))
      .rejects.toMatchObject({ status: 401 });

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('shares ONE refresh across concurrent 401s', async () => {
    const refresh = vi.fn(async () => true);
    apiService.setRefreshHandler(refresh);

    const seen = new Set();
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      if (seen.has(u)) return respond(200, { url: u });
      seen.add(u);
      return respond(401);
    }));

    await Promise.all([
      apiService.fetch('/api/nodes', {}, 'a', false, 0, true),
      apiService.fetch('/api/providers', {}, 'b', false, 0, true),
      apiService.fetch('/api/events/stats', {}, 'c', false, 0, true),
    ]);

    // Without single-flight this is 3 refreshes racing, and the losers write a
    // stale token over the winner's fresh one.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });
});

// Cached GETs used to be keyed by URL alone and survive sign-out: a portal user
// signing in on a tab an account had used was served the ACCOUNT's responses
// for the same URL until they expired (5 minutes for /api/acls).
describe('apiService response cache — one identity never reads another\'s', () => {
  const url = 'https://cloud.voipappz.io/api/acls';
  beforeEach(() => {
    localStorage.clear();
    apiService.resetSession();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('serves a cached response to the identity that fetched it', () => {
    localStorage.setItem('auth', JSON.stringify({ access: 'account-token' }));
    apiService.setCache(url, { who: 'account' });
    expect(apiService.getFromCache(url)).toEqual({ who: 'account' });
  });

  it('does not serve it to a different identity', () => {
    localStorage.setItem('auth', JSON.stringify({ access: 'account-token' }));
    apiService.setCache(url, { who: 'account' });
    localStorage.removeItem('auth');
    localStorage.setItem('user_auth', JSON.stringify({ token: 'user-token' }));
    expect(apiService.getFromCache(url)).toBeNull();
  });

  it('resetSession forgets every cached and in-flight response', () => {
    localStorage.setItem('auth', JSON.stringify({ access: 'account-token' }));
    apiService.setCache(url, { who: 'account' });
    apiService.resetSession();
    expect(apiService.responseCache.size).toBe(0);
    expect(apiService.pendingRequests.size).toBe(0);
  });
});

// A form body passed already encoded (`params.toString()`) must go out as is.
// JSON.stringify used to wrap it in quotes: renaming a customer to "demo" sent
// `"name=demo&enabled=true"`, which Rack read as a key `"name` and a value
// ending in a quote.
describe('apiService post/patch/put — a string body is sent as is', () => {
  let spy;
  beforeEach(() => {
    spy = vi.spyOn(apiService, 'fetch').mockResolvedValue({});
  });
  afterEach(() => spy.mockRestore());

  const encoded = new URLSearchParams({ name: 'demo', enabled: 'true' }).toString();

  it.each(['post', 'patch'])('%s keeps the encoded form body and marks it a form', async (method) => {
    await apiService[method]('/api/customers/c-1', encoded, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const [, opts] = spy.mock.calls[0];
    expect(opts.body).toBe('name=demo&enabled=true');
    expect(opts.body.startsWith('"')).toBe(false);
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(opts.body))).toEqual({ name: 'demo', enabled: 'true' });
  });

  it.each(['post', 'patch'])('%s defaults a bare string to a form body', async (method) => {
    await apiService[method]('/api/x', encoded);
    expect(spy.mock.calls[0][1].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('put sends a string body as is', async () => {
    await apiService.put('/api/x', encoded);
    expect(spy.mock.calls[0][1].body).toBe('name=demo&enabled=true');
  });

  it('still sends objects as JSON', async () => {
    await apiService.patch('/api/x', { name: 'demo' });
    const [, opts] = spy.mock.calls[0];
    expect(opts.body).toBe('{"name":"demo"}');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });
});

// "✅ Successfully completed: fetching tariffs" on every page load: loading data
// must never toast. A success toast is for a change the user made; errors are
// always reported.
describe('apiService success toasts — never for a load', () => {
  let success;
  let failure;

  const respond = (status, body = {}) => ({
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  beforeEach(() => {
    success = vi.fn();
    failure = vi.fn();
    apiService.setMessageHandlers(success, failure);
    apiService.authInitializing = false;
    apiService.authContextLogout = vi.fn();
    apiService.pendingRequests.clear();
    apiService.clearCache?.();
    apiService.rateLimitConfig.minRequestInterval = 0;
    vi.spyOn(apiService, 'getToken').mockReturnValue('tok');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    apiService.setMessageHandlers(null, null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a GET with showMessages=true shows no success toast', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, [{ id: 1 }])));

    await apiService.get('/api/tariffs', {}, 'fetching tariffs', true, true);

    expect(success).not.toHaveBeenCalled();
  });

  it('a failing GET still reports its error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(422, { error: 'bad filter' })));

    await expect(apiService.get('/api/tariffs?x', {}, 'fetching tariffs', true, true)).rejects.toThrow();

    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalled();
  });

  it('a POST still announces its success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(201, { id: 2 })));

    await apiService.post('/api/tariffs', { name: 't' }, {}, 'creating tariff', true, true);

    expect(success).toHaveBeenCalledWith(expect.stringContaining('creating tariff'));
  });

  it('a write whose context says it is loading stays quiet too', () => {
    expect(apiService.constructor.announcesSuccess('POST', 'fetching report rows')).toBe(false);
    expect(apiService.constructor.announcesSuccess('DELETE', 'deleting tariff')).toBe(true);
    expect(apiService.constructor.announcesSuccess('HEAD', 'ping')).toBe(false);
  });
});

// Codex review 2026-10-15: GET /api/devices/:id carries the SIP password with
// Cache-Control: no-store, and the GET cache kept it anyway.
describe('apiService GET cache — Cache-Control: no-store', () => {
  const respond = (cacheControl) => ({
    status: 200,
    ok: true,
    headers: { get: (h) => (h.toLowerCase() === 'cache-control' ? cacheControl : null) },
    json: async () => ({ uuid: 'd1', password: 'Sip-Secret' }),
    text: async () => JSON.stringify({ uuid: 'd1', password: 'Sip-Secret' }),
  });

  beforeEach(() => {
    apiService.authInitializing = false;
    apiService.pendingRequests.clear();
    apiService.clearCache?.();
    apiService.rateLimitConfig.minRequestInterval = 0;
    vi.spyOn(apiService, 'getToken').mockReturnValue('tok');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not keep a no-store response: the next read asks the server again', async () => {
    const fetchSpy = vi.fn(async () => respond('no-store'));
    vi.stubGlobal('fetch', fetchSpy);
    await apiService.get('/api/devices/d1', {}, 'device', false);
    await apiService.get('/api/devices/d1', {}, 'device', false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('still caches an ordinary GET', async () => {
    const fetchSpy = vi.fn(async () => respond(null));
    vi.stubGlobal('fetch', fetchSpy);
    await apiService.get('/api/devices/d2', {}, 'device', false);
    await apiService.get('/api/devices/d2', {}, 'device', false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
