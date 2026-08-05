import { describe, expect, it } from 'vitest';
import { incomingAlertKey, toneForCall } from './useIncomingCallAlerts';
import { RINGBACK, RINGTONE, startTone } from './tones';
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

describe('call progress tones', () => {
  it('rings for an inbound call and gives ringback for an outbound one', () => {
    expect(toneForCall(inbound)).toEqual({ key: 'in:call-1', pattern: RINGTONE });
    expect(toneForCall({ ...inbound, direction: 'outbound' })).toEqual({ key: 'out:call-1', pattern: RINGBACK });
  });

  it('is silent unless the call is ringing', () => {
    expect(toneForCall({ ...inbound, state: 'connecting' })).toBeNull();
    expect(toneForCall({ ...inbound, state: 'active' })).toBeNull();
    expect(toneForCall({ ...inbound, state: 'ended' })).toBeNull();
    expect(toneForCall(null)).toBeNull();
  });

  it('keys the tone by call id, so an unrelated re-render cannot restart it', () => {
    const first = toneForCall(inbound)?.key;
    expect(toneForCall({ ...inbound, remote: 'changed', connectedAt: 1 })?.key).toBe(first);
    expect(toneForCall({ ...inbound, id: 'call-2' })?.key).not.toBe(first);
  });

  it('degrades to a no-op stop function where Web Audio is unavailable', () => {
    // jsdom has no AudioContext — the visual toast is the guaranteed alert and
    // the tone must never throw its way into the call path.
    const stop = startTone(RINGTONE);
    expect(() => { stop(); stop(); }).not.toThrow();
  });
});
