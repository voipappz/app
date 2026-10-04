import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../i18n';
import { formatDate, formatOnlyDate, currentLocaleTag, currentDateFnsLocale } from './dateUtils';
import { formatNumber } from './numberUtils';

/**
 * The point of these is the FIRST block: English output must be byte-identical
 * to what shipped before dates became locale-aware. The whole i18n effort rests
 * on English being unchanged, and here that is cheap to assert and easy to
 * break — he-IL and en-GB both use Gregorian dates, Western digits and
 * DD.MM.YYYY, so a regression would look almost right.
 */

// A fixed UTC instant, written the three ways the server sends timestamps.
const ISO_Z = '2026-07-20T18:58:03Z';
const TZLESS_SPACE = '2026-07-20 18:58:03'; // UTC, but says nothing
const TZLESS_T = '2026-07-20T18:58:03';

const withLanguage = async (lng, fn) => {
  await i18n.changeLanguage(lng);
  try { return fn(); } finally { await i18n.changeLanguage('en'); }
};

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('English output is unchanged', () => {
  // Compared against an explicit en-GB reference rather than a literal string:
  // toLocaleString renders in LOCAL time, so a hardcoded "18:58:03" would pass
  // in the UTC container and fail on anyone's machine. The reference pins the
  // thing that actually matters -- that English still means en-GB with these
  // options -- and is timezone-independent.
  it('formats date + time exactly as en-GB did', () => {
    const reference = new Date(ISO_Z).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    expect(formatDate(ISO_Z)).toBe(reference);
  });

  it('puts the day first, 24-hour, no AM/PM', () => {
    // en-US would render 07/20/2026 and 6:58:03 PM.
    expect(formatDate(ISO_Z)).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}$/);
  });

  it('formats date only exactly as en-GB did', () => {
    const reference = new Date('2026-07-20').toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    expect(formatOnlyDate('2026-07-20')).toBe(reference);
    expect(formatOnlyDate('2026-07-20')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('groups numbers with a comma', () => {
    // Was Intl.NumberFormat('en-US'); en-GB groups identically.
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('maps English to en-GB, not en-US', () => {
    // en-US would render 07/20/2026 and break every date on every screen.
    expect(currentLocaleTag()).toBe('en-GB');
  });
});

describe('tz-less server timestamps', () => {
  it('reads a space-separated tz-less timestamp as UTC, like the ISO form', () => {
    // The bug toDate() exists for: without normalising, this parses as LOCAL
    // and every call log is off by the client offset.
    expect(formatDate(TZLESS_SPACE)).toBe(formatDate(ISO_Z));
  });

  it('reads a T-separated tz-less timestamp as UTC too', () => {
    expect(formatDate(TZLESS_T)).toBe(formatDate(ISO_Z));
  });

  it('accepts a Date object', () => {
    expect(formatDate(new Date(ISO_Z))).toBe(formatDate(ISO_Z));
  });
});

describe('unusable input renders a dash, never a crash', () => {
  it.each([undefined, null, '', 0, false, NaN])('formatDate(%s)', (bad) => {
    expect(formatDate(bad)).toBe('-');
  });

  it.each(['not a date', '2026-13-45T99:99:99Z', {}])('formatDate(%s) on junk', (bad) => {
    expect(formatDate(bad)).toBe('-');
  });

  it.each([undefined, null, '', 'nonsense'])('formatOnlyDate(%s)', (bad) => {
    expect(formatOnlyDate(bad)).toBe('-');
  });

  it('formatNumber coerces rubbish to 0 rather than NaN', () => {
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('Hebrew', () => {
  it('formats with he-IL', async () => {
    await withLanguage('he', () => {
      expect(currentLocaleTag()).toBe('he-IL');
    });
  });

  it('keeps Gregorian dates and Western digits', async () => {
    await withLanguage('he', () => {
      const out = formatDate(ISO_Z);
      // Same instant, same calendar, ASCII digits — only separators differ.
      expect(out).toMatch(/2026/);
      expect(out).toMatch(/\d{2}:\d{2}:\d{2}/);
      expect(out).not.toMatch(/[֐-׿]/); // no Hebrew letters in a date
    });
  });

  it('groups numbers the same way', async () => {
    await withLanguage('he', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
    });
  });

  it('supplies the date-fns Hebrew locale, and nothing for English', async () => {
    expect(currentDateFnsLocale()).toBeUndefined(); // date-fns's own default
    await withLanguage('he', () => {
      expect(currentDateFnsLocale()).toBeDefined();
      expect(currentDateFnsLocale().code).toBe('he');
    });
  });
});
