import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callsApi } from './callsApi';
import { apiService } from '../apiService';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn() }, toFormData: vi.fn() }));

// Braces matter: a function returned from beforeEach is run as its cleanup.
beforeEach(() => { apiService.get.mockReset(); apiService.post.mockReset(); });

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

describe('getCallHistory', () => {
  it("asks the server for the call's history, newest first as sent", async () => {
    apiService.get.mockResolvedValue([{ uuid: 'b' }, { uuid: 'a' }]);
    expect((await callsApi.getCallHistory('c1')).map((c) => c.uuid)).toEqual(['b', 'a']);
    expect(apiService.get.mock.calls[0][0]).toBe('/api/calls/c1?action=history');
  });

  it('reads a { data } answer too', async () => {
    apiService.get.mockResolvedValue({ data: [{ uuid: 'a' }] });
    expect(await callsApi.getCallHistory('c1')).toEqual([{ uuid: 'a' }]);
  });

  it('returns nothing when the server has no history (404)', async () => {
    apiService.get.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    expect(await callsApi.getCallHistory('c1')).toEqual([]);
  });

  it('lets any other failure through', async () => {
    apiService.get.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(callsApi.getCallHistory('c1')).rejects.toThrow('boom');
  });
});

describe('requestTranscription', () => {
  it('posts to the call\'s transcribe route', async () => {
    apiService.post.mockResolvedValue({ requested: true, services: 1 });
    expect(await callsApi.requestTranscription('c1')).toEqual({ requested: true, services: 1 });
    expect(apiService.post.mock.calls[0][0]).toBe('/api/calls/c1/transcribe');
  });

  it('throws the server\'s reason', async () => {
    const error = new Error('Failed requesting: HTTP 422: {"id":"unprocessable_entity","message":"This call has no recording"}');
    error.status = 422;
    apiService.post.mockRejectedValue(error);
    await expect(callsApi.requestTranscription('c1')).rejects.toMatchObject({ message: 'This call has no recording', status: 422 });
  });
});
