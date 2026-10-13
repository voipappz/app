import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callsApi } from './callsApi';
import { apiService } from '../apiService';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn() }, toFormData: vi.fn() }));

// Braces matter: a function returned from beforeEach is run as its cleanup.
beforeEach(() => { apiService.get.mockReset(); });

describe('getTranscript', () => {
  it('returns the text', async () => {
    apiService.get.mockResolvedValue({ call_uuid: 'c1', transcript: 'Hello there' });
    expect(await callsApi.getTranscript('c1')).toBe('Hello there');
    expect(apiService.get.mock.calls[0][0]).toBe('/api/calls/c1/transcript');
  });

  it('returns null when the call has none', async () => {
    apiService.get.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    expect(await callsApi.getTranscript('c1')).toBeNull();
  });

  it('lets any other failure through', async () => {
    apiService.get.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(callsApi.getTranscript('c1')).rejects.toThrow('boom');
  });
});

describe('getNumberHistory', () => {
  const call = (uuid, created_at, caller, callee) => ({ uuid, created_at, profile: { caller, callee } });

  it('asks for calls from and to the number, and merges them newest first', async () => {
    apiService.get.mockImplementation(async (url) => (url.includes('caller')
      ? { data: [call('a', '2026-10-01T10:00:00Z', '0541234567', '201'), call('x', '2026-10-05T10:00:00Z', '05412345670', '201')] }
      : [call('b', '2026-10-03T10:00:00Z', '201', '054-123-4567'), call('a', '2026-10-01T10:00:00Z', '0541234567', '201')]));

    const calls = await callsApi.getNumberHistory('054-123-4567');

    expect(calls.map((c) => c.uuid)).toEqual(['b', 'a']);
    const urls = apiService.get.mock.calls.map(([url]) => decodeURIComponent(url));
    expect(urls[0]).toContain('search[call.caller][IS][]=0541234567');
    expect(urls[1]).toContain('search[call.callee][IS][]=0541234567');
    expect(urls[0]).toContain('search[created_at]=');
    expect(urls[0]).toContain('order_type=desc');
  });

  it('asks nothing for an empty number', async () => {
    expect(await callsApi.getNumberHistory('')).toEqual([]);
    expect(apiService.get).not.toHaveBeenCalled();
  });
});
