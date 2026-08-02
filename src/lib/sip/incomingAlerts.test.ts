import { describe, expect, it } from 'vitest';
import { incomingAlertKey } from './useIncomingCallAlerts';
import type { CallInfo } from './useSipPhone';

const inbound: CallInfo = { id: 'call-1', direction: 'inbound', remote: '200', state: 'ringing' };

describe('incoming WebRTC alerts', () => {
  it('alerts only for an inbound ringing call', () => {
    expect(incomingAlertKey(inbound)).toBe('call-1');
    expect(incomingAlertKey({ ...inbound, state: 'connecting' })).toBeNull();
    expect(incomingAlertKey({ ...inbound, state: 'active' })).toBeNull();
    expect(incomingAlertKey({ ...inbound, direction: 'outbound' })).toBeNull();
    expect(incomingAlertKey(null)).toBeNull();
  });
});
