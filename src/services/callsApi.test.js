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
