import { describe, it, expect } from 'vitest';
import { buildCallsQuery, normalizeApiCall } from './callsApi';

describe('buildCallsQuery', () => {
  it('always sends paging + sort', () => {
    const q = new URLSearchParams(buildCallsQuery());
    expect(q.get('page')).toBe('1');
    expect(q.get('per_page')).toBe('20');
    expect(q.get('order_by')).toBe('created_at');
    expect(q.get('order_type')).toBe('desc');
  });

  it('encodes a date range as search[created_at]=<start> - <end> in epoch seconds', () => {
    const q = new URLSearchParams(buildCallsQuery({ range: { start: 1_752_000_000_000, end: 1_784_800_000_000 } }));
    expect(q.get('search[created_at]')).toBe('1752000000 - 1784800000');
  });

  it('omits the range when absent', () => {
    expect(new URLSearchParams(buildCallsQuery({})).get('search[created_at]')).toBeNull();
  });

  it('encodes scalar filters, operator filters, and array filters', () => {
    const q = new URLSearchParams(buildCallsQuery({
      search: { direction: 'inbound', from_number: { value: '555', op: 'contains' }, status: ['completed', 'busy'] },
    }));
    expect(q.get('search[direction]')).toBe('inbound');
    expect(q.get('search[from_number][contains]')).toBe('555');
    expect(q.getAll('search[status][]')).toEqual(['completed', 'busy']);
  });

  it('keeps the Nimbus operator on repeated array filters', () => {
    const q = new URLSearchParams(buildCallsQuery({
      search: { 'call.direction': { value: ['incoming', 'outgoing'], op: 'IS' } },
    }));
    expect(q.getAll('search[call.direction][IS][]')).toEqual(['incoming', 'outgoing']);
    expect(q.has('search[call.direction][]')).toBe(false);
  });

  it('skips empty values', () => {
    const q = new URLSearchParams(buildCallsQuery({ search: { a: '', b: null, c: undefined } }));
    expect(q.get('search[a]')).toBeNull();
    expect(q.get('search[b]')).toBeNull();
  });

  it('honours paging + sort overrides', () => {
    const q = new URLSearchParams(buildCallsQuery({ page: 3, perPage: 50, orderBy: 'created_at', orderType: 'asc' }));
    expect(q.get('page')).toBe('3');
    expect(q.get('per_page')).toBe('50');
    expect(q.get('order_type')).toBe('asc');
  });
});

describe('normalizeApiCall', () => {
  // Shape verified live against MTN: fields nested under `meta`.
  const row = {
    uuid: 'c-1',
    created_at: '2026-07-13T14:10:47+00:00',
    updated_at: '2026-07-13T14:11:47+00:00',
    leg_a_type: 'did',
    leg_b_type: 'ivr',
    recording: { url: 'https://x/rec/c-1' },
    meta: { _direction: 'incoming', _contact_number: '0302664741', _did_number: '+233308040110', _leg_a_cause: 'answer' },
  };

  it('flattens the meta-nested API row', () => {
    const c = normalizeApiCall(row);
    expect(c.id).toBe('c-1');
    expect(c.started_at).toBe('2026-07-13T14:10:47+00:00');
    expect(c.direction).toBe('inbound');            // incoming → inbound
    expect(c.status).toBe('answer');
    expect(c.from_number).toBe('0302664741');
    expect(c.to_number).toBe('+233308040110');
    expect(c.recording_url).toBe('https://x/rec/c-1');
    expect(c.leg_count).toBe(2);
  });

  it('derives duration from created→updated when no numeric field', () => {
    expect(normalizeApiCall(row).duration_seconds).toBe(60);
  });

  it('prefers an explicit duration field', () => {
    expect(normalizeApiCall({ ...row, meta: { ...row.meta, _duration: 12 } }).duration_seconds).toBe(12);
  });

  it('maps outgoing → outbound and tolerates a bare row', () => {
    expect(normalizeApiCall({ uuid: 'x', meta: { _direction: 'outgoing' } }).direction).toBe('outbound');
    const bare = normalizeApiCall({ uuid: 'y' });
    expect(bare.id).toBe('y');
    expect(bare.duration_seconds).toBe(0);
    expect(bare.recording_url).toBeNull();
  });

  it('tolerates a null meta object from a partial API row', () => {
    const call = normalizeApiCall({ uuid: 'partial', meta: null });
    expect(call.id).toBe('partial');
    expect(call.direction).toBe('');
    expect(call.status).toBe('');
  });
});

// Fixtures taken verbatim from live MTN calls (GET /api/calls). The Calls page
// was reading meta fields that real rows mostly do not carry, so From/To were
// blank on 46 of 50 sampled rows and every duration was rendered in hours.
describe('normalizeApiCall against real API rows', () => {
  const outgoing = {
    uuid: '57237181-9b21-4ab9-8545-6e67bdc0ee4e',
    created_at: '2026-08-03T10:57:24+00:00',
    updated_at: '2026-08-03T15:55:42+00:00',   // ~5h after the call — record write, not call length
    leg_a_type: 'extension', leg_b_type: 'number',
    meta: { _type: 'extension_to_number', _ended: 'false', _direction: 'outgoing' },
    profile: { caller: 'name', callee: '0593911389', direction: 'outgoing',
               state: 'complete', duration: 173, talk_duration: 163 },
    recording: { url: 'https://mtnunicom.mtn.com.gh/recordings/57237181' },
  };

  it('reads From/To from profile, which real rows actually carry', () => {
    const c = normalizeApiCall(outgoing);
    expect(c.from_number).toBe('name');
    expect(c.to_number).toBe('0593911389');
  });

  it('uses profile.duration instead of the record-timestamp delta', () => {
    // The delta here is 17,878s (4h58m). The call was 173s.
    expect(normalizeApiCall(outgoing).duration_seconds).toBe(173);
  });

  it('takes the call state from profile', () => {
    expect(normalizeApiCall(outgoing).status).toBe('complete');
  });

  // Inbound rows DO carry the meta numbers; those must still work.
  it('still reads meta numbers when profile has none', () => {
    const inbound = {
      uuid: 'x', created_at: '2026-08-03T10:00:00+00:00', updated_at: '2026-08-03T10:01:00+00:00',
      meta: { _direction: 'incoming', _contact_number: '0245475455', _did_number: '+233308013883' },
      profile: {},
    };
    const c = normalizeApiCall(inbound);
    expect(c.direction).toBe('inbound');
    expect(c.from_number).toBe('0245475455');
    expect(c.to_number).toBe('+233308013883');
  });

  // Better to show nothing than to show a 5-hour call that lasted seconds.
  it('refuses an implausible timestamp fallback rather than inventing hours', () => {
    const noDuration = { ...outgoing, profile: { caller: 'a', callee: 'b', state: 'complete' } };
    expect(normalizeApiCall(noDuration).duration_seconds).toBe(0);
  });

  it('accepts a plausible fallback when nothing authoritative exists', () => {
    const short = {
      uuid: 'y', created_at: '2026-08-03T10:00:00+00:00', updated_at: '2026-08-03T10:00:45+00:00',
      meta: { _direction: 'outgoing' }, profile: { caller: 'a', callee: 'b' },
    };
    expect(normalizeApiCall(short).duration_seconds).toBe(45);
  });
});
