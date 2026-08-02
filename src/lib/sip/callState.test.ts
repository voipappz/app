import { describe, expect, it } from 'vitest';
import { reduceCallState, type CallInfo } from './useSipPhone';

const ringing: CallInfo = { id: 'call-1', direction: 'inbound', remote: '200', state: 'ringing' };

describe('WebRTC call state', () => {
  it('follows ringing → connecting → active → ended → cleared', () => {
    let call = reduceCallState(null, { type: 'start', call: ringing });
    call = reduceCallState(call, { type: 'connecting', id: 'call-1' });
    expect(call?.state).toBe('connecting');
    call = reduceCallState(call, { type: 'established', id: 'call-1', at: 1234 });
    expect(call).toMatchObject({ state: 'active', connectedAt: 1234 });
    call = reduceCallState(call, { type: 'terminated', id: 'call-1' });
    expect(call?.state).toBe('ended');
    expect(reduceCallState(call, { type: 'clear', id: 'call-1' })).toBeNull();
  });

  it('ignores late events from a different call UUID', () => {
    const current = { ...ringing, id: 'call-2' };
    expect(reduceCallState(current, { type: 'terminated', id: 'call-1' })).toEqual(current);
  });

  it('does not clear a call before termination', () => {
    expect(reduceCallState(ringing, { type: 'clear', id: 'call-1' })).toEqual(ringing);
  });

  it('does not let a second call replace a live call', () => {
    const second: CallInfo = { ...ringing, id: 'call-2' };
    expect(reduceCallState(ringing, { type: 'start', call: second })).toEqual(ringing);
  });

  it('allows a new call after the previous call has ended', () => {
    const ended: CallInfo = { ...ringing, state: 'ended' };
    const second: CallInfo = { ...ringing, id: 'call-2' };
    expect(reduceCallState(ended, { type: 'start', call: second })).toEqual(second);
  });
});
