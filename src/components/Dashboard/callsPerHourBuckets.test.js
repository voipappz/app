// The chart's series is now derived from the mothership's call list rather than
// InfluxDB, so the bucketing is ours and has to be pinned.
import { describe, it, expect } from 'vitest';
import { bucketCallsPerHour, hourBucket } from './callsPerHourBuckets';

const at = (iso) => ({ startedAt: iso, direction: 'inbound' });

describe('bucketCallsPerHour', () => {
  const from = Date.parse('2026-08-05T10:15:00Z');
  const to = Date.parse('2026-08-05T13:45:00Z');

  it('counts by direction into the hour a call started in', () => {
    const points = bucketCallsPerHour([
      { startedAt: '2026-08-05T11:05:00Z', direction: 'inbound' },
      { startedAt: '2026-08-05T11:59:59Z', direction: 'outbound' },
      { startedAt: '2026-08-05T12:00:00Z', direction: 'inbound' },
    ], { from, to });

    const eleven = points.find((p) => p.bucket === '2026-08-05T11:00:00Z');
    expect(eleven).toMatchObject({ inbound: 1, outbound: 1, total: 2 });
    expect(points.find((p) => p.bucket === '2026-08-05T12:00:00Z')).toMatchObject({ inbound: 1, total: 1 });
  });

  // A gap must read as a quiet hour, not as missing data.
  it('includes empty hours with zeros, in order', () => {
    const points = bucketCallsPerHour([], { from, to });
    expect(points.map((p) => p.bucket)).toEqual([
      '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z',
      '2026-08-05T12:00:00Z', '2026-08-05T13:00:00Z',
    ]);
    expect(points.every((p) => p.total === 0)).toBe(true);
  });

  // The API pages by recency, so an over-fetch can return older rows. They must
  // not stretch the axis under the reader.
  it('drops calls outside the window', () => {
    const points = bucketCallsPerHour([at('2026-08-04T09:00:00Z'), at('2026-08-05T11:30:00Z')], { from, to });
    expect(points.reduce((n, p) => n + p.total, 0)).toBe(1);
  });

  it('ignores unusable rows rather than throwing', () => {
    const points = bucketCallsPerHour([null, {}, { startedAt: 'not-a-date' }, at('2026-08-05T11:30:00Z')], { from, to });
    expect(points.reduce((n, p) => n + p.total, 0)).toBe(1);
  });

  it('counts a call of unknown direction in the total only', () => {
    const points = bucketCallsPerHour([{ startedAt: '2026-08-05T11:10:00Z', direction: undefined }], { from, to });
    const eleven = points.find((p) => p.bucket === '2026-08-05T11:00:00Z');
    expect(eleven).toMatchObject({ inbound: 0, outbound: 0, total: 1 });
  });

  it('buckets to the top of the UTC hour', () => {
    expect(hourBucket('2026-08-05T11:59:59.999Z')).toBe('2026-08-05T11:00:00Z');
    expect(hourBucket('nonsense')).toBeNull();
  });
});
