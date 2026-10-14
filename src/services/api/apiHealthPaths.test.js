import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

import { metricsApi } from './metricsApi';
import { checkHealth } from '../../hooks/useApiHealth';

// At a mothership's Kong, /health is GATUS and the API's own health is under
// /api/health (mothership f12d37a). The admin kept calling /health…: the
// verbose dialog read Gatus's "Cannot GET /api/v1/endpoints/statuses/detailed"
// as JSON, and the Health list showed Gatus's endpoint array as "the API".
const answer = (status, body) => ({ status, ok: status < 400, text: async () => body });

describe('the API health paths', () => {
  // The paths are what is checked, not a developer's .env base URL.
  beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', ''); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('detailed health is /api/health/detailed', async () => {
    const fetch = vi.fn().mockResolvedValue(answer(200, '{"overall":{"status":"healthy","healthy":true},"checks":{}}'));
    vi.stubGlobal('fetch', fetch);
    const res = await metricsApi.getDetailedHealth();
    expect(fetch.mock.calls[0][0]).toBe('/api/health/detailed');
    expect(res.healthy).toBe(true);
  });

  it('says what came back when detailed health is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(404, 'Cannot GET /api/v1/endpoints/statuses/detailed')));
    await expect(metricsApi.getDetailedHealth())
      .rejects.toThrow('/api/health/detailed answered HTTP 404 without JSON: Cannot GET');
  });

  it('the polled summary is /api/health?verbose', async () => {
    const fetch = vi.fn().mockResolvedValue(answer(200, '{"status":"ok","checks":{"database":{"ok":true}}}'));
    vi.stubGlobal('fetch', fetch);
    await checkHealth({ verbose: true });
    expect(fetch.mock.calls[0][0]).toBe('/api/health?verbose');
  });
});
