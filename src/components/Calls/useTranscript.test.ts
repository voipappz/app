import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTranscript } from './useTranscript';
import { storeMockTranscript } from './conversation-mocks';

// Unit-tests the pure seam extracted from Calls.jsx. No React render needed.
describe('loadTranscript', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('null callId → null, no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await loadTranscript(null)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches and returns the engine transcript payload', async () => {
    const payload = { status: 'completed', language: 'he-IL', segments: [{ speaker: 'A', text: 'שלום' }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => payload } as Response);
    expect(await loadTranscript('call-1')).toEqual(payload);
  });

  it('maps a fetch error to status:none (no throw)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    expect(await loadTranscript('call-2')).toEqual({ status: 'none', segments: [] });
  });

  it('short-circuits to a stored mock transcript without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    storeMockTranscript('call-3', { status: 'completed', segments: [{ speaker: 'A', text: 'mock' }] });
    const r = await loadTranscript('call-3');
    expect((r as any).segments[0].text).toBe('mock');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
