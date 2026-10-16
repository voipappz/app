import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDialNow } from './useDialNow';

const open = vi.fn();
const dial = vi.fn();
let phone;
vi.mock('../context/PortalSidebarContext', () => ({ usePortalSidebar: () => ({ open }) }));
vi.mock('../context/SoftphoneContext', () => ({ useSoftphone: () => phone }));

beforeEach(() => {
  open.mockClear();
  dial.mockReset();
  phone = { connected: true, call: null, dial };
});

describe('useDialNow', () => {
  it('dials the number and opens the phone', async () => {
    const { result } = renderHook(() => useDialNow());
    expect(result.current.canDial).toBe(true);
    await result.current.dialNow('+972 (3) 555-1234');
    expect(dial).toHaveBeenCalledWith('+97235551234');
    expect(open).toHaveBeenCalledWith('phone', { tab: 'dialpad', number: '+97235551234' });
  });

  it('cannot dial while the phone is not connected', async () => {
    phone = { connected: false, call: null, dial };
    const { result } = renderHook(() => useDialNow());
    expect(result.current.canDial).toBe(false);
    await result.current.dialNow('0541234567');
    expect(dial).not.toHaveBeenCalled();
  });

  it('does not cut off a call in progress', async () => {
    phone = { connected: true, call: { state: 'active' }, dial };
    const { result } = renderHook(() => useDialNow());
    await result.current.dialNow('0541234567');
    expect(dial).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalled();
  });

  it('survives a failed dial', async () => {
    dial.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDialNow());
    await expect(result.current.dialNow('0541234567')).resolves.toBeUndefined();
  });
});
