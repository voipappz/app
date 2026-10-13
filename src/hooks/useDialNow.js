import { useCallback } from 'react';
import { useSoftphone } from '../context/SoftphoneContext';
import { usePortalSidebar } from '../context/PortalSidebarContext';
import { dialable } from './useCallNumber';

/**
 * Call a number now, through the browser phone. Unlike useCallNumber (a click
 * in a table only fills the dialpad), this is a "Call" button: the person chose
 * to call. The phone opens so the call can be seen and ended.
 *
 * `canDial` is false while the phone is not registered: the button is then
 * left out, not shown disabled. A user session registers its own extension,
 * so this works for users as well as accounts.
 */
export function useDialNow() {
  const { connected, dial, call } = useSoftphone();
  const { open } = usePortalSidebar();

  const dialNow = useCallback(async (number) => {
    const n = dialable(number);
    if (!n) return;
    open('phone', { tab: 'dialpad', number: n });
    // A call already in progress is not cut off: the number waits in the dialpad.
    if (!connected || (call && call.state !== 'ended')) return;
    try {
      await dial(n);
    } catch {
      // The phone screen shows its own error, and the number is in the dialpad.
    }
  }, [open, connected, call, dial]);

  return { canDial: Boolean(connected), dialNow };
}
