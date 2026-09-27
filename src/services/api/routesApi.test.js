import { beforeEach, describe, expect, it, vi } from 'vitest';

const patch = vi.fn(() => Promise.resolve({}));
vi.mock('../apiService', async (importOriginal) => ({
  ...(await importOriginal()),
  apiService: { patch: (...args) => patch(...args) },
}));

const { default: routesApi } = await import('./routesApi');

beforeEach(() => patch.mockClear());

describe('routesApi.updateDID', () => {
  it('sends a cleared replace so the API drops the old one', async () => {
    await routesApi.updateDID('r-1', { name: 'Israel', number: '0', replace: '', type: 'feature:trunk', enabled: true });

    const body = patch.mock.calls[0][1];
    expect(body.has('replace')).toBe(true);
    expect(body.get('replace')).toBe('');
    expect(body.get('number')).toBe('0');
  });

  it('still leaves out fields the form did not set', async () => {
    await routesApi.updateDID('r-1', { name: 'Israel', bridge_uuid: '' });

    expect(patch.mock.calls[0][1].has('bridge_uuid')).toBe(false);
  });
});
