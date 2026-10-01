import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn(() => Promise.resolve({ uuid: 'a-1' }));
const get = vi.fn();
vi.mock('../apiService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  apiService: { post: (...args) => post(...args), get: (...args) => get(...args) },
}));

const { default: announcementsApi, BUILTIN_FALLBACK } = await import('./announcementsApi.js');

beforeEach(() => { post.mockClear(); get.mockReset(); });

describe('announcementsApi built-ins', () => {
  it("asks the API for the application's built-in, by name, with no file", async () => {
    await announcementsApi.createBuiltin({ name: 'SILENCE', environment_uuid: 'env-1', enabled: true, notes: '' });

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/announcements/builtin');
    expect(body.get('name')).toBe('SILENCE');
    expect(body.get('environment_uuid')).toBe('env-1');
    expect(body.has('path')).toBe(false);
    expect(body.has('file')).toBe(false);
  });

  it('creates it by name the old way on an API without that endpoint', async () => {
    post.mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }));
    await announcementsApi.createBuiltin({ name: 'MOH', environment_uuid: 'env-1', enabled: true, notes: '' });

    expect(post.mock.calls[1][0]).toBe('/api/announcements');
    expect(post.mock.calls[1][1].get('name')).toBe('MOH');
  });

  it('lists what the API offers', async () => {
    get.mockResolvedValue([{ name: 'MOH', label: 'Music on hold' }]);
    expect(await announcementsApi.getBuiltins()).toEqual([{ name: 'MOH', label: 'Music on hold' }]);
    expect(get.mock.calls[0][0]).toBe('/api/announcements?action=builtins');
  });

  it('falls back to MOH, Ringing and Silence when the API cannot say', async () => {
    get.mockRejectedValue(new Error('404'));
    expect(await announcementsApi.getBuiltins()).toEqual(BUILTIN_FALLBACK);
    expect(BUILTIN_FALLBACK.map(b => b.name)).toEqual(['MOH', 'RINGING', 'SILENCE']);
  });
});
