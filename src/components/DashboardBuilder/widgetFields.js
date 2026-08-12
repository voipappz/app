/**
 * Field derivation for the widget editor's field select.
 *
 * Nimbus asked an `/api/dashboard/identities/:type/fields` endpoint what was
 * selectable. This backend has no such endpoint, so the options are derived
 * from the LIVE `/dashboard/snapshot` payload the dashboard already holds:
 *   - `stats`        → its own keys (total, answered, failed, …)
 *   - `calls_per_hour` → the point keys minus the `bucket` axis
 *   - `recent_calls` → the union of row keys minus the internal `id`
 *
 * When the snapshot is empty (fresh install, no events yet) the documented
 * shape in `useDashboardSnapshot.ts` is the fallback, so the editor is never
 * blank.
 */
import { COUNTER_METRICS } from '../../services/dashboardsApi';
import { SOURCE_BY_TYPE } from './widgetTemplates';

/** Documented snapshot shape — the fallback when live data is empty. */
export const FALLBACK_FIELDS = {
  stats: COUNTER_METRICS,
  calls_per_hour: ['inbound', 'outbound', 'total'],
  recent_calls: ['started_at', 'direction', 'from_number', 'to_number', 'status', 'duration_sec'],
  events: ['occurred_at', 'event_type', 'action', 'call_id', 'received_at'],
};

// Keys that address a row rather than describe it — never offered as fields.
const HIDDEN = { stats: [], calls_per_hour: ['bucket'], recent_calls: ['id'] };

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function unionKeys(rows, hidden) {
  const keys = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isPlainObject(row)) continue;
    for (const key of Object.keys(row)) {
      if (!hidden.includes(key) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/** name → a JS-ish type hint, used only as a caption in the field list. */
export function fieldKind(name) {
  if (/_sec$|_count$|^total$|^answered$|^failed$|^inbound$|^outbound$/.test(name)) return 'number';
  if (/_at$/.test(name)) return 'timestamp';
  return 'string';
}

/**
 * snapshot → { stats: Field[], calls_per_hour: Field[], recent_calls: Field[] }
 * where Field = { name, source, kind }.
 */
export function deriveFieldOptions(snapshot) {
  const stats = isPlainObject(snapshot?.stats) ? Object.keys(snapshot.stats) : [];
  const perHour = unionKeys(snapshot?.calls_per_hour, HIDDEN.calls_per_hour);
  const recent = unionKeys(snapshot?.recent_calls, HIDDEN.recent_calls);

  const build = (source, names) => (names.length ? names : FALLBACK_FIELDS[source])
    .map((name) => ({ name, source, kind: fieldKind(name) }));

  return {
    stats: build('stats', stats),
    calls_per_hour: build('calls_per_hour', perHour),
    recent_calls: build('recent_calls', recent),
    events: build('events', []),
  };
}

/** The options relevant to one widget, i.e. those of its type's source. */
export function fieldsForType(type, options) {
  return options?.[SOURCE_BY_TYPE[type] || 'stats'] || [];
}

/** counter/gauge read ONE stat; trend/table read a set of columns. */
export function isSingleField(type) {
  return SOURCE_BY_TYPE[type] === 'stats';
}

export function isFieldless(type) {
  return type === 'event_counter';
}

/**
 * Toggle one field on a widget draft, honouring single vs multi selection.
 * Single-select types keep `metric` (what the dashboard renders) in sync with
 * `fields[0]`, so the stored definition stays readable by the older renderer.
 */
export function toggleField(widget, name) {
  if (isSingleField(widget.type)) {
    return { ...widget, metric: name, fields: [name] };
  }
  const current = Array.isArray(widget.fields) ? widget.fields : [];
  const fields = current.includes(name) ? current.filter((f) => f !== name) : [...current, name];
  return { ...widget, fields };
}

/** Is `name` selected on this widget? */
export function isFieldSelected(widget, name) {
  if (isSingleField(widget.type)) return widget.metric === name;
  return Array.isArray(widget.fields) && widget.fields.includes(name);
}

/**
 * Re-point a widget at its new type's source: switching counter → table must
 * not leave `fields` full of stat keys the table cannot show.
 */
export function retargetType(widget, type, options) {
  if (isFieldless(type)) return { ...widget, type, metric: 'total', fields: [] };
  const available = fieldsForType(type, options).map((f) => f.name);
  if (isSingleField(type)) {
    const metric = available.includes(widget.metric) ? widget.metric : available[0] || '';
    return { ...widget, type, metric, fields: metric ? [metric] : [] };
  }
  const kept = (Array.isArray(widget.fields) ? widget.fields : []).filter((f) => available.includes(f));
  return { ...widget, type, fields: kept.length ? kept : available };
}
