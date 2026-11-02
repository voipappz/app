import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCallNumber, useOpenPhoneAs } from './useCallNumber';

const open = vi.fn();
let userSession = false;
vi.mock('../context/PortalSidebarContext', () => ({ usePortalSidebar: () => ({ open }) }));
vi.mock('./useIsUserSession', () => ({ useIsUserSession: () => userSession }));

beforeEach(() => {
  open.mockClear();
  userSession = false;
});

describe('useCallNumber', () => {
  // A click on a number opens the phone on the right with the number in the
  // dialpad. It does not dial: a click in a table is not a decision to call.
  it('opens the phone with the number ready to dial', () => {
    const { result } = renderHook(() => useCallNumber());
    result.current('+972 (3) 555-1234');
    expect(open).toHaveBeenCalledWith('phone', { tab: 'dialpad', number: '+97235551234' });
  });

  it('ignores an empty number', () => {
    const { result } = renderHook(() => useCallNumber());
    result.current('  ');
    expect(open).not.toHaveBeenCalled();
  });

  // A user's phone is their own extension: the number goes in its dialpad.
  it('opens the user\'s own phone with the number ready to dial', () => {
    userSession = true;
    const { result } = renderHook(() => useCallNumber());
    result.current('+972 3 555 1234');
    expect(open).toHaveBeenCalledWith('phone', { tab: 'dialpad', number: '+97235551234' });
  });
});

describe('useOpenPhoneAs', () => {
  it('opens the phone signed in as a device', () => {
    const { result } = renderHook(() => useOpenPhoneAs());
    const device = { uuid: 'dev-1', username: '201' };
    result.current(device);
    expect(open).toHaveBeenCalledWith('phone', { tab: 'dialpad', device });
  });

  // A user cannot sign the phone in as another device: their own extension
  // is already registered, so the button opens that phone.
  it('opens the user\'s own phone, not the device', () => {
    userSession = true;
    const { result } = renderHook(() => useOpenPhoneAs());
    result.current({ uuid: 'dev-1', username: '201' });
    expect(open).toHaveBeenCalledWith('phone', { tab: 'dialpad' });
  });
});
