const BASE_FIELDS = ['occurred_at', 'event_type', 'action', 'call_id'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/** Flatten one normalized DuckDB event into selectable table columns. */
export function eventViewRow(event = {}) {
  const row = Object.fromEntries(
    ['event_id', 'call_id', 'event_type', 'action', 'occurred_at', 'received_at']
      .map((key) => [key, event[key] ?? '']),
  );
  if (isObject(event.payload)) {
    for (const [key, value] of Object.entries(event.payload)) {
      row[`payload.${key}`] = isObject(value) || Array.isArray(value)
        ? JSON.stringify(value)
        : value ?? '';
    }
  }
  return row;
}
export function eventFields(events = []) {
  const names = [...BASE_FIELDS];
  for (const event of events) {
    for (const name of Object.keys(eventViewRow(event))) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.map((name) => ({
    name,
    source: 'events',
    kind: /_at$|occurred_at|received_at/.test(name) ? 'timestamp' : 'string',
  }));
}

export function eventWidgetDraft(view, kind = 'event_table') {
  const eventType = String(view?.eventType || '').trim();
  const action = String(view?.action || '').trim();
  const label = action || eventType || 'All events';
  return {
    title: kind === 'event_counter' ? `${label} count` : label,
    type: kind,
    metric: 'total',
    fields: kind === 'event_table' ? [...BASE_FIELDS] : [],
    eventType,
    action,
    icon: 'Insights',
    unit: kind === 'event_counter' ? 'events' : '',
  };
}
