import { useEffect, useState } from 'react';
import { useSoftphone } from '../../context/SoftphoneContext';

/**
 * A connected call's running time as mm:ss, from `connectedAt` (ms); 00:00
 * when there is none. The phone and the call dock show the same clock.
 */
export function useCallTimer(connectedAt) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!connectedAt) { setSecs(0); return undefined; }
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [connectedAt]);
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * Hold and resume the current call. setHeld resolves only when the PBX
 * answers the re-INVITE, so the button stays off while a change is under
 * way, and while a transfer owns the hold state.
 */
export function useHold() {
  const { call, held, setHeld, transfer, consult } = useSoftphone();
  const [pending, setPending] = useState(false);
  const transferBusy = Boolean(transfer) || Boolean(consult && consult.state !== 'ended');
  const toggle = async () => {
    setPending(true);
    try { await setHeld(!held); } catch { /* surfaced via lastError */ }
    finally { setPending(false); }
  };
  return { held, toggle, disabled: call?.state !== 'active' || pending || transferBusy, transferBusy };
}
