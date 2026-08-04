import { describe, it, expect } from 'vitest';
import { counterpartyNumber, fmtCallTime, isInbound, isMissed } from './recentCallFormat';
import { normalizeApiCall } from '../../services/callsApi';

describe('counterpartyNumber', () => {
  // Real /api/calls shapes: `_contact_number` is the other party either way,
  // `_did_number` is ours.
  const inbound = normalizeApiCall({
    uuid: 'in', meta: { _direction: 'incoming', _contact_number: '0302664741', _did_number: '+233308040110' },
  });
  const outbound = normalizeApiCall({
    uuid: 'out', meta: { _direction: 'outgoing', _contact_number: '0501234567', _did_number: '+233308040110' },
  });

  it('shows the other party, not our own DID, in both directions', () => {
    expect(counterpartyNumber(inbound)).toBe('0302664741');
    expect(counterpartyNumber(outbound)).toBe('0501234567');
  });

  it('falls back to the normalized fields when meta is missing', () => {
    expect(counterpartyNumber({ direction: 'inbound', from_number: '111', to_number: '222' })).toBe('111');
    expect(counterpartyNumber({ direction: 'outbound', from_number: '111', to_number: '222' })).toBe('222');
  });

  it('returns an empty string for a row with no numbers at all', () => {
    expect(counterpartyNumber({})).toBe('');
    expect(counterpartyNumber(null)).toBe('');
  });
});

describe('fmtCallTime', () => {
  // The API sends zone-less UTC ("2026-08-04 09:30:00"); asDate forces UTC so
  // the row reads in the browser's timezone instead of drifting by the offset.
  const now = new Date('2026-08-04T12:00:00Z');

  it('shows a clock for calls from today', () => {
    expect(fmtCallTime('2026-08-04 09:30:00', now, 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('adds a short date for older calls', () => {
    expect(fmtCallTime('2026-07-29 09:30:00', now, 'en-GB')).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it('is blank for a missing or unparseable timestamp', () => {
    expect(fmtCallTime(null, now)).toBe('');
    expect(fmtCallTime('not a date', now)).toBe('');
  });
});

describe('direction helpers', () => {
  it('reads inbound off the normalized direction', () => {
    expect(isInbound({ direction: 'inbound' })).toBe(true);
    expect(isInbound({ direction: 'outbound' })).toBe(false);
    expect(isInbound(null)).toBe(false);
  });

  it('calls an unanswered inbound call missed — and nothing else', () => {
    expect(isMissed({ direction: 'inbound', status: 'no_answer' })).toBe(true);
    expect(isMissed({ direction: 'inbound', status: 'BUSY' })).toBe(true);
    expect(isMissed({ direction: 'inbound', status: 'answer' })).toBe(false);
    // an outbound call nobody picked up is not a missed call in the log
    expect(isMissed({ direction: 'outbound', status: 'no_answer' })).toBe(false);
  });
});
