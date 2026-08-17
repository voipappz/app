import { describe, it, expect } from 'vitest';
import { SessionState } from 'sip.js';
import { pruneEndedSessions, reduceCallState } from './useSipPhone';

const session = (state: SessionState) => ({ state });

describe('pruneEndedSessions', () => {
  it('keeps a live call — a real busy phone must still reject', () => {
    const sessions = new Map([['a', session(SessionState.Established)]]);
    expect(pruneEndedSessions(sessions, 'a')).toBe('a');
    expect(sessions.size).toBe(1);
  });

  // The regression: handleIncomingCall treats a non-empty map as "busy", so one
  // session that never reached Terminated silently rejected every later call —
  // no toast, no Answer button, on a phone that still looked registered.
  it('drops a terminated session so the next incoming call is not rejected as busy', () => {
    const sessions = new Map([['dead', session(SessionState.Terminated)]]);
    expect(pruneEndedSessions(sessions, 'dead')).toBeNull();
    expect(sessions.size).toBe(0);
  });

  it('clears an active id whose session is already gone', () => {
    // Nothing to point at: keeping the id can only block calls.
    expect(pruneEndedSessions(new Map(), 'orphan')).toBeNull();
  });

  it('keeps a live call while sweeping a dead one beside it', () => {
    const sessions = new Map([
      ['dead', session(SessionState.Terminated)],
      ['live', session(SessionState.Established)],
    ]);
    expect(pruneEndedSessions(sessions, 'live')).toBe('live');
    expect([...sessions.keys()]).toEqual(['live']);
  });

  it('leaves an idle phone idle', () => {
    expect(pruneEndedSessions(new Map(), null)).toBeNull();
  });

  it('does not sweep a call that is still establishing', () => {
    const sessions = new Map([['ringing', session(SessionState.Establishing)]]);
    expect(pruneEndedSessions(sessions, 'ringing')).toBe('ringing');
    expect(sessions.size).toBe(1);
  });
});

// The second way an incoming call went unanswerable: the VISIBLE call and the
// session map are separate state. `start` keeps whatever is showing unless it
// has ended, so a call left visible after its session vanished swallowed every
// later INVITE — no toast, no Answer button, on a phone that looked healthy.
describe('reduceCallState start', () => {
  const inbound = { id: 'new', direction: 'inbound' as const, remote: '100', state: 'ringing' as const };

  it('discards an incoming call while a stale one is still visible', () => {
    const stale = { id: 'old', direction: 'outbound' as const, remote: '200', state: 'active' as const };
    // Reproduces the bug: the new call never becomes visible.
    expect(reduceCallState(stale, { type: 'start', call: inbound })).toBe(stale);
  });

  it('accepts it once the stale call is cleared — what handleIncomingCall now does', () => {
    expect(reduceCallState(null, { type: 'start', call: inbound })).toEqual(inbound);
  });

  it('still accepts one over a call that has properly ended', () => {
    const ended = { id: 'old', direction: 'outbound' as const, remote: '200', state: 'ended' as const };
    expect(reduceCallState(ended, { type: 'start', call: inbound })).toEqual(inbound);
  });

  it('does not let a new call trample a genuinely live one', () => {
    const live = { id: 'live', direction: 'inbound' as const, remote: '300', state: 'active' as const };
    expect(reduceCallState(live, { type: 'start', call: inbound })).toBe(live);
  });
});
