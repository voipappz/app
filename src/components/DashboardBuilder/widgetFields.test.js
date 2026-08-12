import { describe, it, expect } from 'vitest';
import {
  deriveFieldOptions, FALLBACK_FIELDS, fieldsForType, isFieldSelected,
  isFieldless, isSingleField, retargetType, toggleField,
} from './widgetFields';

const SNAPSHOT = {
  stats: { total: 3, answered: 2, failed: 1, inbound: 2, outbound: 1, avg_duration_sec: 42 },
  calls_per_hour: [{ bucket: '2026-08-04 10:00:00', inbound: 2, outbound: 1, total: 3 }],
  recent_calls: [
    { id: 'c1', direction: 'inbound', from_number: '1', to_number: '2', status: 'answered', started_at: 'x', duration_sec: 10 },
    { id: 'c2', direction: 'outbound', from_number: '3', to_number: '4', status: 'failed', started_at: 'y', duration_sec: 0, tag: 'vip' },
  ],
};

describe('deriveFieldOptions', () => {
  it('reads the options straight off the live snapshot', () => {
    const options = deriveFieldOptions(SNAPSHOT);
    expect(options.stats.map((f) => f.name)).toEqual(Object.keys(SNAPSHOT.stats));
    expect(options.calls_per_hour.map((f) => f.name)).toEqual(['inbound', 'outbound', 'total']);
    // union of row keys — the second row's extra column is offered too
    expect(options.recent_calls.map((f) => f.name)).toContain('tag');
  });

  it('hides the addressing keys (bucket, id)', () => {
    const options = deriveFieldOptions(SNAPSHOT);
    expect(options.calls_per_hour.map((f) => f.name)).not.toContain('bucket');
    expect(options.recent_calls.map((f) => f.name)).not.toContain('id');
  });

  it('falls back to the documented shape when the snapshot is empty', () => {
    for (const snapshot of [undefined, null, {}, { stats: {}, calls_per_hour: [], recent_calls: [] }]) {
      const options = deriveFieldOptions(snapshot);
      expect(options.stats.map((f) => f.name)).toEqual(FALLBACK_FIELDS.stats);
      expect(options.recent_calls.map((f) => f.name)).toEqual(FALLBACK_FIELDS.recent_calls);
    }
  });

  it('tags each option with its source and a kind hint', () => {
    const options = deriveFieldOptions(SNAPSHOT);
    expect(options.stats[0]).toEqual({ name: 'total', source: 'stats', kind: 'number' });
    expect(options.recent_calls.find((f) => f.name === 'started_at').kind).toBe('timestamp');
    expect(options.recent_calls.find((f) => f.name === 'status').kind).toBe('string');
  });

  it('survives garbage rows', () => {
    const options = deriveFieldOptions({ recent_calls: [null, 'nope', ['x']], calls_per_hour: 'nope' });
    expect(options.recent_calls.map((f) => f.name)).toEqual(FALLBACK_FIELDS.recent_calls);
  });
});

describe('field selection', () => {
  const options = deriveFieldOptions(SNAPSHOT);

  it('is single for stat-backed types and multi for the rest', () => {
    expect(isSingleField('counter')).toBe(true);
    expect(isSingleField('gauge')).toBe(true);
    expect(isSingleField('stat')).toBe(true);
    expect(isSingleField('table')).toBe(false);
    expect(isSingleField('trend')).toBe(false);
    expect(isSingleField('line')).toBe(false);
    expect(isFieldless('event_counter')).toBe(true);
  });

  it('keeps metric and fields in sync for a counter', () => {
    const next = toggleField({ type: 'counter', metric: 'total', fields: ['total'] }, 'failed');
    expect(next).toMatchObject({ metric: 'failed', fields: ['failed'] });
    expect(isFieldSelected(next, 'failed')).toBe(true);
    expect(isFieldSelected(next, 'total')).toBe(false);
    // re-toggling the same field is a no-op, never an empty metric
    expect(toggleField(next, 'failed').metric).toBe('failed');
  });

  it('adds and removes columns for a table', () => {
    const base = { type: 'table', fields: ['status'] };
    const added = toggleField(base, 'from_number');
    expect(added.fields).toEqual(['status', 'from_number']);
    expect(toggleField(added, 'status').fields).toEqual(['from_number']);
    expect(base.fields).toEqual(['status']); // input untouched
  });

  it('offers a type only the fields of its own source', () => {
    expect(fieldsForType('table', options)).toBe(options.recent_calls);
    expect(fieldsForType('trend', options)).toBe(options.calls_per_hour);
    expect(fieldsForType('pie', options)).toBe(options.calls_per_hour);
    expect(fieldsForType('gauge', options)).toBe(options.stats);
    expect(fieldsForType('event_table', options)).toBe(options.events);
  });
});

describe('retargetType', () => {
  it('drops fields the new source cannot serve', () => {
    const next = retargetType({ type: 'counter', metric: 'answered', fields: ['answered'] }, 'table', options());
    expect(next.type).toBe('table');
    expect(next.fields).not.toContain('answered');
    expect(next.fields.length).toBeGreaterThan(0); // seeded with everything available
  });

  it('keeps a still-valid metric when staying on stats', () => {
    expect(retargetType({ type: 'counter', metric: 'failed' }, 'gauge', options()))
      .toMatchObject({ type: 'gauge', metric: 'failed', fields: ['failed'] });
  });

  it('picks the first stat when the previous metric is not a stat', () => {
    expect(retargetType({ type: 'table', fields: ['status'] }, 'counter', options()).metric).toBe('total');
  });

  it('keeps the overlap when both sources share a name', () => {
    expect(retargetType({ type: 'table', fields: ['status', 'inbound'] }, 'trend', options()).fields)
      .toEqual(['inbound']);
  });

  it('clears fields when switching to an event counter', () => {
    expect(retargetType({ type: 'table', fields: ['status'] }, 'event_counter', options()))
      .toMatchObject({ type: 'event_counter', metric: 'total', fields: [] });
  });

  function options() { return deriveFieldOptions(SNAPSHOT); }
});
