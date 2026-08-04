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

// The bug behind "invalid dial target": dial() re-read the environment for the
// SIP domain instead of using the one the UA registered with. VITE_SIP_DOMAIN
// is unset on every real deployment — the domain comes from the logged-in
// user's environment — so the host was empty and the URI was `sip:<number>@`.
import { sipTargetAddress } from './transfer';

describe('dial target construction', () => {
  it('builds a URI from the number and the registered domain', () => {
    expect(sipTargetAddress('0545234585', 'mtnunicom.mtn.com.gh'))
      .toBe('sip:0545234585@mtnunicom.mtn.com.gh');
  });

  // This is the exact failure the user hit.
  it('returns null with no domain — which is what surfaced as "invalid dial target"', () => {
    expect(sipTargetAddress('0545234585', '')).toBeNull();
  });

  // The exact number that failed in production: an E.164 with spaces. The '+'
  // is legal in a SIP user part and must survive; only the spacing is noise.
  it('keeps a leading + and strips the spacing', () => {
    expect(sipTargetAddress('+233 30 273 8000', 'mtnunicom.mtn.com.gh'))
      .toBe('sip:+233302738000@mtnunicom.mtn.com.gh');
    expect(sipTargetAddress('+233 30 273 8000', '')).toBeNull();
  });

  it('strips dial-pad decoration that would make the URI invalid', () => {
    expect(sipTargetAddress('054 523-4585', 'x.com')).toBe('sip:0545234585@x.com');
  });

  it('passes a full URI through, and honours an explicit host', () => {
    expect(sipTargetAddress('sip:bob@other.com', 'x.com')).toBe('sip:bob@other.com');
    expect(sipTargetAddress('bob@other.com', 'x.com')).toBe('sip:bob@other.com');
  });
});
