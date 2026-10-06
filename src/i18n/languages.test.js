import { describe, it, expect } from 'vitest';
import { directionFor, normalizeLanguage } from './languages';

describe('languages', () => {
  it('reduces a locale tag to a language we ship', () => {
    expect(normalizeLanguage('he-IL')).toBe('he');
    expect(normalizeLanguage('EN')).toBe('en');
  });

  it('falls back to English for anything unknown or missing', () => {
    expect(normalizeLanguage('fr')).toBe('en');
    expect(normalizeLanguage(null)).toBe('en');
  });

  it('gives Hebrew a right-to-left direction', () => {
    expect(directionFor('he')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });
});
