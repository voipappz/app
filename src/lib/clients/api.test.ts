import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EVENTS } from '../../context/AuthContext';
import { getSession, saveSession } from '../auth';
import { apiList } from './api';

describe('mothership API authentication', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_MOCK_LOGIN', '');
    saveSession({ access: 'stale-token', email: 'old@example.com', user_uuid: 'old-user' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('clears a stale cross-tenant session when Nimbus returns 403', async () => {
    const unauthorized = vi.fn();
    window.addEventListener(AUTH_EVENTS.UNAUTHORIZED, unauthorized, { once: true });
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));

    await expect(apiList('/api/calls?page=1')).rejects.toThrow('→ 403');

    expect(getSession()).toBeNull();
    expect(unauthorized).toHaveBeenCalledOnce();
    expect((unauthorized.mock.calls[0][0] as CustomEvent).detail.reason).toBe('403');
  });

  it('keeps the session for an unrelated resource error', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(apiList('/api/missing')).rejects.toThrow('→ 404');

    expect(getSession()?.access).toBe('stale-token');
  });
});
