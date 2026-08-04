import { describe, it, expect } from 'vitest';
import { EXPORT_VERSION, exportFilename, exportWidgets, parseImportedWidgets, toPortable } from './widgetIo';
import { applyTemplate } from './widgetTemplates';

const SAVED = [
  { uuid: 'w1', position: 0, title: 'Answered', type: 'counter', metric: 'answered', icon: 'CheckCircle', color: 'success.main', unit: 'calls' },
  { uuid: 'w2', position: 1, title: 'Recent', type: 'table', fields: ['status', 'from_number'] },
];

describe('exportWidgets', () => {
  it('writes a versioned document with a timestamp', () => {
    const doc = exportWidgets(SAVED);
    expect(doc.version).toBe(EXPORT_VERSION);
    expect(Date.parse(doc.exportedAt)).not.toBeNaN();
    expect(doc.widgets).toHaveLength(2);
  });

  it('strips server-owned identity so an import always creates fresh widgets', () => {
    for (const widget of exportWidgets(SAVED).widgets) {
      expect(widget).not.toHaveProperty('uuid');
      expect(widget).not.toHaveProperty('position');
    }
  });

  it('tolerates a non-array', () => {
    expect(exportWidgets(null).widgets).toEqual([]);
  });
});

describe('round trip', () => {
  it('survives export → JSON → import unchanged', () => {
    const text = JSON.stringify(exportWidgets(SAVED));
    const imported = parseImportedWidgets(text);
    expect(imported).toEqual(SAVED.map(toPortable));
    expect(imported[0]).toMatchObject({ title: 'Answered', metric: 'answered', unit: 'calls' });
    expect(imported[1]).toMatchObject({ type: 'table', fields: ['status', 'from_number'] });
  });

  it('normalizes a template straight through the round trip', () => {
    const [imported] = parseImportedWidgets(JSON.stringify(exportWidgets([applyTemplate('handleTimeGauge')])));
    expect(imported).toMatchObject({ type: 'gauge', metric: 'avg_duration_sec', min: 0, max: 600 });
    expect(imported.thresholds).toEqual({ warning: 180, critical: 300 });
  });
});

describe('parseImportedWidgets', () => {
  it('accepts a bare array as well as the envelope', () => {
    expect(parseImportedWidgets([{ title: 'A', metric: 'total' }])).toHaveLength(1);
    expect(parseImportedWidgets({ widgets: [{ title: 'A', metric: 'total' }] })).toHaveLength(1);
  });

  it('fills partial entries out to the full widget shape', () => {
    const [widget] = parseImportedWidgets([{ title: 'A', metric: 'total' }]);
    expect(widget.type).toBe('counter');
    expect(widget.fields).toEqual([]);
    expect(widget.thresholds).toEqual({ warning: 70, critical: 90 });
  });

  it('drops non-object entries and rejects an unusable document', () => {
    expect(parseImportedWidgets([{ title: 'A' }, null, 'x', ['y']])).toHaveLength(1);
    expect(() => parseImportedWidgets('{}')).toThrow(/no widgets/);
    expect(() => parseImportedWidgets({ widgets: [] })).toThrow(/no widgets/);
    expect(() => parseImportedWidgets('not json')).toThrow();
  });
});

describe('exportFilename', () => {
  it('is date-stamped and .json', () => {
    expect(exportFilename(new Date('2026-08-04T09:30:00Z'))).toBe('dashboard-2026-08-04.json');
  });
});
