import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mocked at the apiList boundary — never the network. callsApi is exercised for
// real on top of it, so the query it builds is asserted here too.
vi.mock('../../lib/clients/api', () => ({ apiList: vi.fn() }));

import { apiList } from '../../lib/clients/api';
import { useRecentCalls, RECENT_CALLS_LIMIT } from './useRecentCalls';

const row = (uuid) => ({
  uuid, created_at: '2026-08-04T10:00:00Z', updated_at: '2026-08-04T10:01:00Z',
  meta: { _direction: 'incoming', _contact_number: '0501234567' },
});

describe('useRecentCalls', () => {
  beforeEach(() => {
    apiList.mockReset();
    apiList.mockResolvedValue({ rows: [row('c-1'), row('c-2')], total: 2 });
  });

  it('does NOT fetch on mount — an apiList 401 at boot would drop the session', async () => {
    renderHook(() => useRecentCalls(false));
    await Promise.resolve();
    expect(apiList).not.toHaveBeenCalled();
  });

  it('fetches the last calls once the surface becomes active', async () => {
    const { result, rerender } = renderHook(({ active }) => useRecentCalls(active), {
      initialProps: { active: false },
    });
    expect(apiList).not.toHaveBeenCalled();

    rerender({ active: true });
    await waitFor(() => expect(result.current.calls).toHaveLength(2));

    const path = apiList.mock.calls[0][0];
    expect(path).toContain('/api/calls?');
    expect(new URLSearchParams(path.split('?')[1]).get('per_page')).toBe(String(RECENT_CALLS_LIMIT));
    expect(result.current.calls[0].direction).toBe('inbound');   // normalized by callsApi
    expect(result.current.error).toBeNull();
  });

  it('asks only once, however often the surface is opened and closed', async () => {
    const { result, rerender } = renderHook(({ active }) => useRecentCalls(active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(result.current.calls).toHaveLength(2));

    rerender({ active: false });
    rerender({ active: true });
    await Promise.resolve();
    expect(apiList).toHaveBeenCalledTimes(1);

    // …until asked explicitly.
    await act(() => result.current.reload());
    expect(apiList).toHaveBeenCalledTimes(2);
  });

  it('keeps the list empty and reports the failure instead of throwing', async () => {
    apiList.mockRejectedValue(new Error('/api/calls → 500'));
    const { result } = renderHook(() => useRecentCalls(true));
    await waitFor(() => expect(result.current.error).toBe('/api/calls → 500'));
    expect(result.current.calls).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('never shows more than the limit, whatever the API returns', async () => {
    apiList.mockResolvedValue({ rows: Array.from({ length: 25 }, (_, i) => row(`c-${i}`)), total: 25 });
    const { result } = renderHook(() => useRecentCalls(true));
    await waitFor(() => expect(result.current.calls.length).toBe(RECENT_CALLS_LIMIT));
  });
});
