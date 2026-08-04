import { describe, it, expect } from 'vitest';
import { formatWidgetValue, gaugePercent, ICON_NAMES, resolveIcon, thresholdColor } from './widgetPresentation';
import { WIDGET_TEMPLATES } from './widgetTemplates';

describe('formatWidgetValue', () => {
  it('renders second-valued metrics as mm:ss without a unit suffix', () => {
    expect(formatWidgetValue({ metric: 'avg_duration_sec', unit: 'sec' }, 125)).toBe('02:05');
    expect(formatWidgetValue({ metric: 'avg_duration_sec' }, 0)).toBe('00:00');
  });

  it('appends the unit to a plain counter', () => {
    expect(formatWidgetValue({ metric: 'total', unit: 'calls' }, 7)).toBe('7 calls');
    expect(formatWidgetValue({ metric: 'total', unit: '' }, 7)).toBe('7');
    expect(formatWidgetValue({ metric: 'total' }, undefined)).toBe('0');
  });
});

describe('thresholdColor', () => {
  const widget = { color: 'info.main', thresholds: { warning: 10, critical: 20 } };

  it('escalates green → amber → red as the value climbs', () => {
    expect(thresholdColor(widget, 5)).toBe('info.main');
    expect(thresholdColor(widget, 10)).toBe('warning.main');
    expect(thresholdColor(widget, 25)).toBe('error.main');
  });

  it('flips the comparison when inverse is set', () => {
    const sla = { ...widget, inverse: true, thresholds: { warning: 80, critical: 70 } };
    expect(thresholdColor(sla, 95)).toBe('info.main');
    expect(thresholdColor(sla, 80)).toBe('warning.main');
    expect(thresholdColor(sla, 60)).toBe('error.main');
  });

  it('keeps the widget colour when no threshold is set', () => {
    expect(thresholdColor({ color: 'success.main' }, 999)).toBe('success.main');
    expect(thresholdColor({}, 5)).toBeUndefined();
    expect(thresholdColor(widget, 'n/a')).toBe('info.main');
  });
});

describe('gaugePercent', () => {
  it('clamps the value into the widget min/max band', () => {
    const gauge = { min: 0, max: 50 };
    expect(gaugePercent(gauge, 25)).toBe(50);
    expect(gaugePercent(gauge, -5)).toBe(0);
    expect(gaugePercent(gauge, 500)).toBe(100);
  });

  it('never divides by an empty band', () => {
    expect(gaugePercent({ min: 10, max: 10 }, 10)).toBe(0);
  });
});

describe('resolveIcon', () => {
  it('resolves every icon a template names', () => {
    for (const template of Object.values(WIDGET_TEMPLATES)) {
      if (template.icon) expect(ICON_NAMES).toContain(template.icon);
    }
  });

  it('falls back to a generic icon for an unknown name', () => {
    expect(resolveIcon('NotAnIcon')).toBe(resolveIcon(undefined));
  });
});
