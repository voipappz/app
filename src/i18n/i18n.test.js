import { describe, it, expect } from 'vitest';
import i18n, {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isRtlLanguage,
  directionFor,
  normalizeLanguage,
} from './index';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import heCommon from './locales/he/common.json';
import heNav from './locales/he/nav.json';

/** Every leaf key, as dotted paths, so two files can be compared as sets. */
const leafKeys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leafKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

/** Interpolation placeholders — {{count}} and friends. */
const placeholders = (s) => (String(s).match(/\{\{[^}]+\}\}/g) || []).sort();

const leafValues = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leafValues(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
  );

describe('i18n setup', () => {
  it('starts in English and falls back to English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(i18n.language).toBe('en');
    // A missing Hebrew key must render the English string, not `ns:key`.
    // i18next normalises fallbackLng to an array, but accept either shape.
    expect([].concat(i18n.options.fallbackLng)).toContain('en');
  });

  it('does not escape interpolated values (React already does)', () => {
    // Otherwise an apostrophe in a name arrives as &#39;.
    expect(i18n.options.interpolation.escapeValue).toBe(false);
  });

  it('does not suspend on a namespace', () => {
    // A namespace suspending inside Layout tears down its state.
    expect(i18n.options.react.useSuspense).toBe(false);
  });

  it('resolves a key in both languages', () => {
    expect(i18n.t('common:action.save')).toBe('Save');
    expect(i18n.getFixedT('he', 'common')('action.save')).toBe('שמור');
  });
});

describe('direction', () => {
  it('reads Hebrew as rtl and English as ltr', () => {
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
    expect(directionFor('he')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it('matches on the primary subtag, so regional forms resolve', () => {
    expect(isRtlLanguage('he-IL')).toBe(true);
    expect(directionFor('en-GB')).toBe('ltr');
  });

  it('treats an RTL script we do not translate into as still RTL', () => {
    // The customer-level `language` field is free-form server data; an Arabic
    // value should lay out correctly even though we ship no Arabic strings.
    expect(isRtlLanguage('ar')).toBe(true);
    expect(normalizeLanguage('ar')).toBe('en');
  });

  it('survives junk', () => {
    for (const junk of [undefined, null, '', 'xx', 42]) {
      expect(directionFor(junk)).toBe('ltr');
      expect(normalizeLanguage(junk)).toBe('en');
    }
  });

  it('normalizes what it ships', () => {
    expect(normalizeLanguage('he')).toBe('he');
    expect(normalizeLanguage('HE-il')).toBe('he');
    expect(normalizeLanguage('en')).toBe('en');
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'he']);
  });
});

/**
 * The parity checks. Without them a key added to English quietly renders in
 * English on a Hebrew screen, and nothing fails — which is how a translation
 * set rots.
 */
describe('en/he parity', () => {
  const namespaces = [
    ['common', enCommon, heCommon],
    ['nav', enNav, heNav],
  ];

  it.each(namespaces)('%s has the same keys in both languages', (_ns, en, he) => {
    expect(leafKeys(he).sort()).toEqual(leafKeys(en).sort());
  });

  it.each(namespaces)('%s has no empty or non-string values', (_ns, en, he) => {
    for (const [, values] of [['en', leafValues(en)], ['he', leafValues(he)]]) {
      for (const [key, value] of values) {
        expect(typeof value, key).toBe('string');
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it.each(namespaces)('%s keeps the same interpolation placeholders', (_ns, en, he) => {
    const heByKey = Object.fromEntries(leafValues(he));
    for (const [key, enValue] of leafValues(en)) {
      // A translator dropping {{count}} breaks the string at runtime only.
      expect(placeholders(heByKey[key]), key).toEqual(placeholders(enValue));
    }
  });

  it('actually translated the Hebrew, rather than copying English', () => {
    const heByKey = Object.fromEntries(leafValues(heCommon));
    const copied = leafValues(enCommon)
      .filter(([key, en]) => heByKey[key] === en)
      // 'CSV' and the like legitimately stay as-is; only flag words with letters
      // that a Hebrew reader would expect translated.
      .filter(([, en]) => /^[A-Za-z][A-Za-z\s]+$/.test(en))
      .map(([key]) => key);
    expect(copied).toEqual([]);
  });
});
