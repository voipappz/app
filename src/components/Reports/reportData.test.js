import { describe, expect, it } from 'vitest';
import { humanizeColumn, normalizeReportResult, reportToCsv } from './reportData';

describe('report result normalization', () => {
  it('normalizes table fields and unwraps nested display cells', () => {
    const result = normalizeReportResult({
      table: {
        fields: [
          { field: 'caller_id', name: 'Caller' },
          { field: 'total_calls', name: 'Calls' },
        ],
        data: [
          { caller_id: { data: '1001', color: 'green' }, total_calls: 3 },
        ],
      },
    }, { name: 'Calls by extension' });

    expect(result).toEqual({
      name: 'Calls by extension',
      columns: ['Caller', 'Calls'],
      rows: [{ Caller: '1001', Calls: 3 }],
    });
  });

  it('supports direct rows, derives columns, and keeps objects readable', () => {
    expect(normalizeReportResult({ data: [{ queue_name: 'Sales', metadata: { count: 2 } }] })).toEqual({
      name: '',
      columns: ['Queue Name', 'Metadata'],
      rows: [{ 'Queue Name': 'Sales', Metadata: '{"count":2}' }],
    });
    expect(humanizeColumn('call.created_at')).toBe('Call Created At');
  });

  it('exports RFC-compatible CSV cells', () => {
    expect(reportToCsv({
      columns: ['Name', 'Comment'],
      rows: [{ Name: 'Sales, IL', Comment: 'said "hello"' }],
    })).toBe('Name,Comment\r\n"Sales, IL","said ""hello"""');
    expect(reportToCsv()).toBe('');
  });
});
