import { describe, it, expect } from 'vitest';
import { buildSections, compareCalls, timeBucket, STATUS_ORDER } from './callsGrouping';

// Fixed "now" so the buckets are deterministic: 2026-05-28 12:00 LOCAL time.
const NOW = new Date(2026, 4, 28, 12, 0, 0);

// The API sends zoneless UTC ("YYYY-MM-DD HH:MM:SS") and asDate appends the Z,
// so build the fixtures the same way: pick a LOCAL wall-clock instant and render
// it as UTC. Keeps the bucket assertions true in any timezone the suite runs in.
const at = (y, m, d, h = 9) =>
  new Date(y, m, d, h, 0, 0).toISOString().slice(0, 19).replace('T', ' ');

const TODAY = at(2026, 4, 28);
const YESTERDAY = at(2026, 4, 27);
const THIS_WEEK = at(2026, 4, 24);
const OLDER = at(2026, 3, 1);

const call = (over = {}) => ({
  id: 'c1', direction: 'inbound', from_number: '1', to_number: '2',
  duration_seconds: 0, status: 'completed', started_at: TODAY,
  leg_count: 1, event_count: 1, ...over,
});

describe('timeBucket', () => {
  it('buckets today, yesterday, this week and older', () => {
    expect(timeBucket(TODAY, NOW)).toBe('Today');
    expect(timeBucket(YESTERDAY, NOW)).toBe('Yesterday');
    expect(timeBucket(THIS_WEEK, NOW)).toBe('This week');
    expect(timeBucket(OLDER, NOW)).toBe('Older');
  });

  it('treats a missing or unparseable timestamp as Older', () => {
    expect(timeBucket(null, NOW)).toBe('Older');
    expect(timeBucket('not a date', NOW)).toBe('Older');
  });
});

describe('compareCalls', () => {
  it('compares durations numerically, not as strings', () => {
    const a = call({ duration_seconds: '9' });
    const b = call({ duration_seconds: '100' });
    expect(compareCalls(a, b, 'duration_seconds', 'asc')).toBeLessThan(0);
  });

  it('compares started_at as an instant and honors the order', () => {
    const older = call({ started_at: OLDER });
    const newer = call({ started_at: TODAY });
    expect(compareCalls(older, newer, 'started_at', 'asc')).toBeLessThan(0);
    expect(compareCalls(older, newer, 'started_at', 'desc')).toBeGreaterThan(0);
  });

  it('sorts nullish values as empty rather than throwing', () => {
    expect(compareCalls(call({ from_number: null }), call({ from_number: 'a' }), 'from_number', 'asc'))
      .toBeLessThan(0);
  });
});

describe('buildSections', () => {
  const rows = [
    call({ id: 'a', status: 'completed', started_at: at(2026, 4, 28, 9) }),
    call({ id: 'b', status: 'failed', started_at: at(2026, 4, 28, 10) }),
    call({ id: 'c', status: 'completed', started_at: at(2026, 4, 27, 10) }),
  ];

  it('flattens to one unlabeled section when grouping is off', () => {
    const [section, ...rest] = buildSections(rows, { groupBy: 'none', now: NOW });
    expect(rest).toHaveLength(0);
    expect(section.label).toBeNull();
    expect(section.subs[0].rows.map((r) => r.id)).toEqual(['b', 'a', 'c']); // started_at desc
  });

  it('groups by time bucket then status, in the canonical status order', () => {
    const sections = buildSections(rows, { groupBy: 'time', now: NOW });
    expect(sections.map((s) => s.label)).toEqual(['Today', 'Yesterday']);
    expect(sections[0].count).toBe(2);
    // 'completed' precedes 'failed' in STATUS_ORDER regardless of arrival order.
    expect(sections[0].subs.map((s) => s.label)).toEqual(['completed', 'failed']);
    expect(STATUS_ORDER.indexOf('completed')).toBeLessThan(STATUS_ORDER.indexOf('failed'));
  });

  it('groups by status alone, one implicit subgroup each', () => {
    const sections = buildSections(rows, { groupBy: 'status', now: NOW });
    expect(sections.map((s) => s.label)).toEqual(['completed', 'failed']);
    expect(sections[0].count).toBe(2);
    expect(sections[0].subs).toHaveLength(1);
    expect(sections[0].subs[0].label).toBeNull();
  });

  it('keeps rows whose status is not in STATUS_ORDER, after the known ones', () => {
    const withUnknown = [...rows, call({ id: 'd', status: 'carrier_reject', started_at: at(2026, 4, 28, 11) })];
    const byStatus = buildSections(withUnknown, { groupBy: 'status', now: NOW });
    expect(byStatus.map((s) => s.label)).toEqual(['completed', 'failed', 'carrier_reject']);

    const byTime = buildSections(withUnknown, { groupBy: 'time', now: NOW });
    const todayRows = byTime[0].subs.flatMap((s) => s.rows.map((r) => r.id));
    expect(todayRows).toContain('d');
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    buildSections(input, { groupBy: 'none', now: NOW });
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list', () => {
    expect(buildSections([], { groupBy: 'time', now: NOW })).toEqual([]);
    expect(buildSections(undefined, { groupBy: 'none', now: NOW })[0].subs[0].rows).toEqual([]);
  });
});
