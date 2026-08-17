import { describe, it, expect } from 'vitest';
import { SessionState } from 'sip.js';
import { pruneEndedSessions } from './useSipPhone';

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
