import { describe, it, expect } from 'vitest';
import {
  applyTemplate, DEFAULT_WIDGET, SOURCE_BY_TYPE, TEMPLATE_CATEGORIES,
  WIDGET_TEMPLATES, WIDGET_TYPES, withDefaults,
} from './widgetTemplates';
import { FALLBACK_FIELDS } from './widgetFields';

describe('the template catalog', () => {
  it('only names metrics/fields this backend actually serves', () => {
    for (const [key, template] of Object.entries(WIDGET_TEMPLATES)) {
      const source = SOURCE_BY_TYPE[template.type];
      expect(source, `${key} has an unknown type`).toBeTruthy();
      if (template.metric) expect(FALLBACK_FIELDS[source], key).toContain(template.metric);
      for (const field of template.fields || []) {
        expect(FALLBACK_FIELDS[source], `${key}.${field}`).toContain(field);
      }
    }
  });

  it('carries no nimbus agents./queue. metrics and no SQL queries', () => {
    for (const template of Object.values(WIDGET_TEMPLATES)) {
      expect(template.metric || '').not.toMatch(/^(agents|queue|metrics)\./);
      expect(template).not.toHaveProperty('query');
      expect(template).not.toHaveProperty('dataSource');
    }
  });

  it('categorises every template exactly once', () => {
    const listed = Object.values(TEMPLATE_CATEGORIES).flat();
    expect([...listed].sort()).toEqual(Object.keys(WIDGET_TEMPLATES).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('applyTemplate', () => {
  it('merges over the defaults so no field leaks from the previous draft', () => {
    const widget = applyTemplate('failedCalls');
    expect(widget).toMatchObject({ type: 'counter', metric: 'failed', icon: 'PhoneMissed' });
    // untouched defaults are still present
    expect(widget.min).toBe(DEFAULT_WIDGET.min);
    expect(widget.fields).toEqual([]);
    // the template's partial thresholds merge over the default pair
    expect(widget.thresholds).toEqual({ warning: 5, critical: 20 });
  });

  it('keeps identity overrides so a template can re-style an existing widget', () => {
    expect(applyTemplate('recentCalls', { uuid: 'w1', position: 3 })).toMatchObject({
      uuid: 'w1', position: 3, type: 'table',
    });
  });

  it('falls back to a blank widget for an unknown key', () => {
    expect(applyTemplate('nope')).toEqual(DEFAULT_WIDGET);
  });

  it('copies template field arrays instead of sharing them', () => {
    const a = applyTemplate('callsPerHour');
    a.fields.push('total');
    expect(WIDGET_TEMPLATES.callsPerHour.fields).toEqual(['inbound', 'outbound']);
  });
});

describe('withDefaults', () => {
  it('fills a legacy definition (title/metric only) out to the full shape', () => {
    expect(withDefaults({ uuid: 'w1', title: 'Old', metric: 'answered' })).toMatchObject({
      uuid: 'w1', title: 'Old', metric: 'answered', type: 'counter', fields: [],
      thresholds: DEFAULT_WIDGET.thresholds,
    });
  });

  it('rejects an unrenderable type', () => {
    expect(withDefaults({ type: 'pie' }).type).toBe('counter');
    for (const type of WIDGET_TYPES) expect(withDefaults({ type }).type).toBe(type);
  });
});
