import { describe, it, expect } from 'vitest';
import i18n from '../../i18n';
import { categoryName, chartKindName, displayTypeName } from './reportWords';

const english = i18n.getFixedT('en', 'reports');
const hebrew = i18n.getFixedT('he', 'reports');

describe('displayTypeName', () => {
  it('names a known type, and tidies one the app does not know', () => {
    expect(displayTypeName(english, 'line')).toBe('Line');
    expect(displayTypeName(hebrew, 'line')).toBe('קווי');
    expect(displayTypeName(english, 'funnel_chart')).toBe('Funnel Chart');
  });
});

describe('chartKindName', () => {
  it('says what the report is drawn as, as the chip did', () => {
    expect(chartKindName(english, 'table')).toBe('Table');
    expect(chartKindName(english, 'line')).toBe('Line chart');
    expect(chartKindName(english, 'gauge')).toBe('Gauge chart');
    expect(chartKindName(hebrew, 'bar')).toBe('גרף עמודות');
  });
});

describe('categoryName', () => {
  // The tabs: the server sends the category key; English shows it as before
  // (the tab capitalizes it), Hebrew gets its name, and a category the app
  // does not know yet still shows its key.
  it('names a known category, and keeps the key of one the app does not know', () => {
    expect(categoryName(english, 'callcenter')).toBe('callcenter');
    expect(categoryName(hebrew, 'callcenter')).toBe('מוקד טלפוני');
    expect(categoryName(hebrew, 'extensions')).toBe('מכשירים');
    expect(categoryName(hebrew, 'marketing')).toBe('marketing');
  });
});
