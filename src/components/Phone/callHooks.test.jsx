import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCallTimer, useHold } from './callHooks';

let phone;
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => phone }));

describe('useCallTimer', () => {
  afterEach(() => vi.useRealTimers());

  it('counts from the moment the call connected, and resets when it ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    const connectedAt = Date.now();
    const { result, rerender } = renderHook(({ at }) => useCallTimer(at), { initialProps: { at: connectedAt } });
    expect(result.current).toBe('00:00');

    act(() => { vi.advanceTimersByTime(65_000); });
    expect(result.current).toBe('01:05');

    rerender({ at: null });
    expect(result.current).toBe('00:00');
  });
});

describe('useHold', () => {
  const connected = { state: 'active' };

  it('holds and resumes, off while the PBX answers', async () => {
    let answerPbx;
    phone = { call: connected, held: false, setHeld: vi.fn(() => new Promise((resolve) => { answerPbx = resolve; })) };
    const { result } = renderHook(() => useHold());
    expect(result.current.disabled).toBe(false);

    act(() => { result.current.toggle(); });
    expect(phone.setHeld).toHaveBeenCalledWith(true);
    expect(result.current.disabled).toBe(true);

    await act(async () => { answerPbx(); });
    expect(result.current.disabled).toBe(false);
  });

  it('is off for a call not yet connected, and during a transfer', () => {
    phone = { call: { state: 'connecting' }, held: false, setHeld: vi.fn() };
    expect(renderHook(() => useHold()).result.current.disabled).toBe(true);

    phone = { call: connected, held: false, setHeld: vi.fn(), consult: { state: 'active' } };
    const { result } = renderHook(() => useHold());
    expect(result.current.disabled).toBe(true);
    expect(result.current.transferBusy).toBe(true);
  });
});
