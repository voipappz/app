import { describe, it, expect } from 'vitest';
import { fmtDuration, fmtClock, asDate } from './callFormat';

describe('fmtDuration', () => {
  it('renders a dash for falsy/zero durations', () => {
    expect(fmtDuration(0)).toBe('—');
    expect(fmtDuration(undefined as unknown as number)).toBe('—');
    expect(fmtDuration(null as unknown as number)).toBe('—');
  });
  it('renders seconds only under a minute', () => {
    expect(fmtDuration(45)).toBe('45s');
  });
  it('renders minutes and seconds at/over a minute', () => {
    expect(fmtDuration(60)).toBe('1m 0s');
    expect(fmtDuration(125)).toBe('2m 5s');
  });
});

describe('fmtClock', () => {
  it('renders 0:00 for falsy/zero', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(undefined as unknown as number)).toBe('0:00');
  });
  it('renders m:ss under an hour with zero-padded seconds', () => {
    expect(fmtClock(5)).toBe('0:05');
    expect(fmtClock(105)).toBe('1:45');
  });
  it('renders h:mm:ss at/over an hour', () => {
    expect(fmtClock(3661)).toBe('1:01:01');
  });
});

describe('asDate', () => {
  it('returns null for empty input', () => {
    expect(asDate('')).toBeNull();
    expect(asDate(null as unknown as string)).toBeNull();
  });
  it('treats space-separated zoneless timestamps as UTC', () => {
    const d = asDate('2026-05-28 21:00:00.123');
    expect(d?.toISOString()).toBe('2026-05-28T21:00:00.123Z');
  });
  it('preserves an explicit zone marker', () => {
    const d = asDate('2026-05-28T21:00:00+02:00');
    expect(d?.toISOString()).toBe('2026-05-28T19:00:00.000Z');
  });
});
