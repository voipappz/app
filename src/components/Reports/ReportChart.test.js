import { describe, it, expect } from 'vitest';
import { splitColumns } from './ReportChart';

// splitColumns is what lets ONE component render every report the engine returns:
// first non-numeric column = label axis, every all-numeric column = a series.
describe('splitColumns', () => {
  // Shape verified live on MTN: /api/reports/dashboards/calls
  const columns = ['name', 'calls', 'count_answered_calls'];
  const rows = [{ name: 'LAURUS AFRICA SECURITIES LTD', calls: '16', count_answered_calls: '0' }];

  it('picks the label column and the numeric series (stringy numbers count)', () => {
    const { label, series } = splitColumns(columns, rows);
    expect(label).toBe('name');
    expect(series).toEqual(['calls', 'count_answered_calls']);
  });

  it('returns no series when nothing is numeric', () => {
    const { label, series } = splitColumns(['a', 'b'], [{ a: 'x', b: 'y' }]);
    expect(label).toBe('a');
    expect(series).toEqual([]);
  });

  it('treats a column as a series only when EVERY row is numeric', () => {
    const { series } = splitColumns(['k', 'v'], [{ k: 'a', v: '1' }, { k: 'b', v: 'n/a' }]);
    expect(series).toEqual([]);
  });

  it('handles all-numeric columns (no label)', () => {
    const { label, series } = splitColumns(['x', 'y'], [{ x: '1', y: '2' }]);
    expect(label).toBeNull();
    expect(series).toEqual(['x', 'y']);
  });

  it('is safe on empty/missing input', () => {
    expect(splitColumns([], [])).toEqual({ label: null, series: [] });
    expect(splitColumns(undefined, undefined)).toEqual({ label: null, series: [] });
  });

  it('ignores empty values when deciding numeric-ness', () => {
    const { series } = splitColumns(['k', 'v'], [{ k: 'a', v: '1' }, { k: 'b', v: '' }]);
    expect(series).toEqual(['v']);
  });
});
