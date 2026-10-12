import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { routeTypeHint, routeTypeLabel } from './routeTypes';

const english = i18n.getFixedT('en', 'routes');
const hebrew = i18n.getFixedT('he', 'routes');

afterEach(() => i18n.changeLanguage('en'));

describe('routeTypeLabel', () => {
  it('names the plain types in words', () => {
    expect(routeTypeLabel(english, 'dst')).toBe('Incoming number');
    expect(routeTypeLabel(english, 'src')).toBe('Caller number');
    expect(routeTypeLabel(english, 'feature')).toBe('Feature (generic)');
  });

  it('names the trunk and the feature codes', () => {
    expect(routeTypeLabel(english, 'feature:trunk')).toBe('Trunk – outgoing calls');
    expect(routeTypeLabel(english, 'feature:user.login')).toBe('Feature – agent log in');
    expect(routeTypeLabel(english, 'feature:pickup_extension')).toBe('Feature – pick up a device');
  });

  it('spells out a feature it does not know', () => {
    expect(routeTypeLabel(english, 'feature:night_mode')).toBe('Feature – night mode');
  });

  it('falls back to the value, underscores as spaces, for an unknown type', () => {
    expect(routeTypeLabel(english, 'caller_id_number')).toBe('caller id number');
    expect(routeTypeLabel(english, 'sip')).toBe('sip');
  });

  it('is empty without a type', () => {
    expect(routeTypeLabel(english, undefined)).toBe('');
  });

  it('reads in Hebrew, and leaves an unknown type as it is', () => {
    expect(routeTypeLabel(hebrew, 'dst')).toBe('מספר נכנס');
    expect(routeTypeLabel(hebrew, 'src')).toBe('מספר המתקשר');
    expect(routeTypeLabel(hebrew, 'feature:spy')).toBe('תכונה – האזנה (ריגול)');
    expect(routeTypeLabel(hebrew, 'feature:night_mode')).toBe('תכונה – night mode');
    expect(routeTypeLabel(hebrew, 'caller_id_number')).toBe('caller id number');
  });
});

describe('routeTypeHint', () => {
  it('says what a type does, in both languages', () => {
    expect(routeTypeHint(english, 'dst')).toBe('Calls arriving on this number are routed to a destination.');
    expect(routeTypeHint(hebrew, 'dst')).toBe('שיחות שמגיעות למספר הזה מנותבות ליעד.');
  });

  it('has none for a generic or unknown type', () => {
    expect(routeTypeHint(english, 'feature')).toBeUndefined();
    expect(routeTypeHint(english, 'caller_id_number')).toBeUndefined();
  });
});
