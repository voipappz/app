import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../i18n';
import { formatDate, formatOnlyDate } from './dateUtils';

afterEach(() => i18n.changeLanguage('en'));

describe('formatDate', () => {
  it('shows English as day/month/year with a 24-hour time, as before', () => {
    expect(formatDate('2026-07-20 18:58:03')).toMatch(/^\d{2}\/\d{2}\/2026, \d{2}:\d{2}:\d{2}$/);
  });

  it('reads a timestamp without a timezone as UTC', () => {
    const fromServer = formatDate('2026-07-20 18:58:03');
    expect(fromServer).toBe(formatDate(new Date(Date.UTC(2026, 6, 20, 18, 58, 3))));
  });

  it('follows Hebrew when it is the active language', async () => {
    const english = formatDate('2026-07-20 18:58:03');
    await i18n.changeLanguage('he');
    const hebrew = formatDate('2026-07-20 18:58:03');
    expect(hebrew).not.toBe(english);
    expect(hebrew).toContain('2026');
  });

  it("returns '-' for empty or invalid input", () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('not a date')).toBe('-');
  });
});

describe('formatOnlyDate', () => {
  it('shows English as day/month/year, as before', () => {
    expect(formatOnlyDate('2026-07-20T12:00:00Z')).toBe('20/07/2026');
  });

  it("returns '-' for empty or invalid input", () => {
    expect(formatOnlyDate('')).toBe('-');
    expect(formatOnlyDate('not a date')).toBe('-');
  });
});
