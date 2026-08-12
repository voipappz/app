import { describe, expect, it } from 'vitest';
import { eventFields, eventViewRow, eventWidgetDraft } from './eventViews';

const EVENT = {
  event_id: 'e1', call_id: 'c1', event_type: 'call.cdr', action: 'cdr.write',
  occurred_at: '2026-08-12 10:00:00', received_at: '2026-08-12 10:00:01',
  payload: { duration: 42, metadata: { source: 'crystal' } },
};

describe('DuckDB event views', () => {
  it('flattens normalized payload fields without depending on raw_payload', () => {
    expect(eventViewRow(EVENT)).toMatchObject({
      event_id: 'e1', event_type: 'call.cdr', 'payload.duration': 42,
      'payload.metadata': '{"source":"crystal"}',
    });
  });

  it('offers base fields plus fields discovered from event payloads', () => {
    expect(eventFields([EVENT]).map((field) => field.name))
      .toEqual(expect.arrayContaining(['occurred_at', 'event_type', 'action', 'call_id', 'payload.duration']));
  });

  it('turns the selected event view into count and table widgets', () => {
    expect(eventWidgetDraft({ eventType: 'call.cdr', action: 'cdr.write' }, 'event_counter'))
      .toMatchObject({ title: 'cdr.write count', type: 'event_counter', eventType: 'call.cdr', action: 'cdr.write' });
    expect(eventWidgetDraft({ eventType: 'call.cdr' }, 'event_table'))
      .toMatchObject({ title: 'call.cdr', type: 'event_table', fields: ['occurred_at', 'event_type', 'action', 'call_id'] });
  });
});
