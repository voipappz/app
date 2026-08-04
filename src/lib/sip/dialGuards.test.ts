// The outgoing dial refused silently. These pin the two reasons it looked dead:
// a stale call slot that outlived its call, and refusals nobody could see.
import { describe, it, expect } from 'vitest';
import { reduceCallState, type CallInfo } from './useSipPhone';

const outbound: CallInfo = { id: 'c1', direction: 'outbound', remote: '0545234585', state: 'connecting' };

describe('outgoing call state', () => {
  // sip.js reports Establishing when the far end is ringing. We used to infer
  // ringing from invite() resolving, which only means the INVITE was written.
  it('moves connecting → ringing', () => {
    const call = reduceCallState(outbound, { type: 'ringing', id: 'c1' });
    expect(call?.state).toBe('ringing');
  });

  it('moves ringing → active when the far end answers', () => {
    const ringing = reduceCallState(outbound, { type: 'ringing', id: 'c1' })!;
    const active = reduceCallState(ringing, { type: 'established', id: 'c1', at: 1000 });
    expect(active).toMatchObject({ state: 'active', connectedAt: 1000 });
  });

  it('ends, then clears — so a failed call cannot hold the phone open', () => {
    const ended = reduceCallState(outbound, { type: 'terminated', id: 'c1' })!;
    expect(ended.state).toBe('ended');
    expect(reduceCallState(ended, { type: 'clear', id: 'c1' })).toBeNull();
  });

  // The sticky slot: a call that never reached 'ended' must not be clearable,
  // or the UI would drop a live call from view while it is still up.
  it('refuses to clear a call that has not ended', () => {
    expect(reduceCallState(outbound, { type: 'clear', id: 'c1' })).toEqual(outbound);
  });

  it('ignores events from a call that is no longer the active one', () => {
    expect(reduceCallState(outbound, { type: 'established', id: 'other' })).toEqual(outbound);
  });

  it('lets a new call start once the previous one ended', () => {
    const ended = reduceCallState(outbound, { type: 'terminated', id: 'c1' })!;
    const next: CallInfo = { id: 'c2', direction: 'outbound', remote: '999', state: 'connecting' };
    expect(reduceCallState(ended, { type: 'start', call: next })).toEqual(next);
  });
});
