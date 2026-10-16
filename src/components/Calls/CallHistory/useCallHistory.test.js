import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCallHistory } from './useCallHistory';
import { callsApi } from '../../../services/api/callsApi';

vi.mock('../../../services/api/callsApi', () => ({ callsApi: { getCallHistory: vi.fn() } }));

beforeEach(() => { callsApi.getCallHistory.mockReset(); });

describe('useCallHistory', () => {
  it("asks for the call's history and leaves the call itself out", async () => {
    callsApi.getCallHistory.mockResolvedValue([{ uuid: 'c1' }, { uuid: 'c0' }]);
    const { result } = renderHook(() => useCallHistory('c1'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.calls).toEqual([{ uuid: 'c0' }]);
    expect(callsApi.getCallHistory).toHaveBeenCalledWith('c1');
  });

  it('says when the history could not load', async () => {
    callsApi.getCallHistory.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCallHistory('c1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.calls).toEqual([]);
  });

  it('drops an answer for a call no longer shown', async () => {
    let answerFirst;
    callsApi.getCallHistory
      .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce([{ uuid: 'b0' }]);
    const { result, rerender } = renderHook(({ uuid }) => useCallHistory(uuid), { initialProps: { uuid: 'a' } });
    rerender({ uuid: 'b' });
    await waitFor(() => expect(result.current.calls).toEqual([{ uuid: 'b0' }]));
    answerFirst([{ uuid: 'a0' }]);
    await Promise.resolve();
    expect(result.current.calls).toEqual([{ uuid: 'b0' }]);
  });

  it('asks nothing without a call', () => {
    renderHook(() => useCallHistory(undefined));
    expect(callsApi.getCallHistory).not.toHaveBeenCalled();
  });
});
