import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useConversationHistory from './useConversationHistory';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

describe('saved conversation history', () => {
  it('ignores a previous call response after selecting another call', async () => {
    const first = deferred();
    const api = { getEvents: vi.fn((id) => id === 'first' ? first.promise : Promise.resolve({ data: [{ id: 'second-event' }] })) };
    const { result, rerender } = renderHook(({ id }) => useConversationHistory(id, { canRead: true, canNotes: true, api }), { initialProps: { id: 'first' } });
    rerender({ id: 'second' });
    await waitFor(() => expect(result.current.events).toEqual([{ id: 'second-event' }]));
    await act(async () => first.resolve({ data: [{ id: 'first-event' }] }));
    expect(result.current.events).toEqual([{ id: 'second-event' }]);
  });

  it('reports a refresh failure without treating a successfully saved note as unsent', async () => {
    const api = { getEvents: vi.fn().mockResolvedValueOnce({ data: [] }).mockRejectedValue(new Error('offline')), addNote: vi.fn().mockResolvedValue({}) };
    const { result } = renderHook(() => useConversationHistory('call', { canRead: true, canNotes: true, api }));
    await waitFor(() => expect(result.current.threadLoading).toBe(false));
    let saved;
    await act(async () => { saved = await result.current.sendNote('Remember this'); });
    expect(saved).toBe(true);
    await waitFor(() => expect(result.current.threadError).toBe(true));
    expect(result.current.sendError).toBe(false);
    expect(api.addNote).toHaveBeenCalledTimes(1);
  });

  it('does not fetch without read access or write without note access', async () => {
    const api = { getEvents: vi.fn(), addNote: vi.fn() };
    const { result } = renderHook(() => useConversationHistory('call', { canRead: false, canNotes: false, api }));
    expect(api.getEvents).not.toHaveBeenCalled();
    expect(await result.current.sendNote('Not allowed')).toBe(false);
    expect(api.addNote).not.toHaveBeenCalled();
  });
});
