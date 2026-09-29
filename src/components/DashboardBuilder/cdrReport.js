// The CDR report: call-centre measures from the InfluxDB `cdr` series, grouped
// by any CDR field. The API builds the SQL from these names
// (/api/monitoring/cdr/report) and always applies the caller's scope; the
// dashboard's editor and every 'cdr' widget share this query shape:
//   { measures: [], dimensions: [], bucket, minutes, where: { dim: 'a,b' }, view, order, limit }

// Used until /cdr/catalog answers (and if it cannot): the API's own lists.
export const FALLBACK_CATALOG = {
  dimensions: [
    ['environment', 'Environment'], ['customer', 'Customer'], ['caller', 'Caller'], ['callee', 'Callee'],
    ['status', 'Status'], ['state', 'State'], ['direction', 'Direction'], ['type', 'Call type'],
    ['cause', 'Hangup cause'], ['hangup', 'Hangup side'], ['agent', 'Agent'], ['extension', 'Extension'],
    ['queue', 'Queue'], ['campaign', 'Campaign'], ['did', 'DID'], ['provider', 'Provider'],
    ['hour', 'Hour of day'], ['weekday', 'Day of week'],
  ].map(([key, label]) => ({ key, label })),
  measures: [
    ['calls', 'Calls', 'count'], ['answered', 'Answered', 'count'], ['missed', 'Missed', 'count'],
    ['answer_rate', 'Answer rate', 'percent'], ['abandoned', 'Abandoned', 'count'], ['abandon_rate', 'Abandon rate', 'percent'],
    ['billsec', 'Billed duration', 'seconds'], ['duration', 'Total duration', 'seconds'], ['avg_talk', 'Avg talk time', 'seconds'],
    ['max_talk', 'Longest call', 'seconds'], ['avg_duration', 'Avg duration', 'seconds'], ['avg_wait', 'Avg time to answer', 'seconds'],
    ['service_level', 'Service level', 'percent'], ['short_calls', 'Short calls (<10s)', 'count'], ['billed', 'Billed amount', 'money'],
    ['unique_callers', 'Unique callers', 'count'], ['mos', 'Call quality (MOS)', 'score'],
  ].map(([key, label, unit]) => ({ key, label, unit })),
  buckets: ['5m', '15m', '1h', '1d'],
};

export const CDR_RANGES = [
  { minutes: 15, label: 'Past 15 minutes' },
  { minutes: 60, label: 'Past hour' },
  { minutes: 360, label: 'Past 6 hours' },
  { minutes: 1440, label: 'Past 24 hours' },
  { minutes: 4320, label: 'Past 3 days' },
  { minutes: 10080, label: 'Past 7 days' },
];
export const BUCKET_LABELS = { '': 'No — totals', '5m': '5 minutes', '15m': '15 minutes', '1h': 'Hour', '1d': 'Day' };
export const CDR_VIEWS = ['table', 'bar', 'line', 'pie', 'number'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const NEW_CDR_QUERY = {
  title: '', type: 'cdr', measures: ['calls', 'answer_rate', 'billsec', 'avg_talk'], dimensions: ['environment'],
  bucket: '', minutes: 1440, where: {}, view: 'table', order: '', limit: 50,
};

export const measureOf = (catalog, key) => (catalog?.measures || []).find((m) => m.key === key)
  || FALLBACK_CATALOG.measures.find((m) => m.key === key) || { key, label: key, unit: 'count' };
export const dimensionLabel = (catalog, key) => ((catalog?.dimensions || []).find((d) => d.key === key)
  || FALLBACK_CATALOG.dimensions.find((d) => d.key === key) || { label: key }).label;

// 3725 → "1h 2m", 85 → "1m 25s", 42 → "42s".
export function formatSeconds(value) {
  const total = Math.round(Number(value) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h.toLocaleString()}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatMeasure(unit, value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (unit === 'percent') return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (unit === 'seconds') return formatSeconds(n);
  if (unit === 'money') return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unit === 'score') return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// A dimension value as people read it: environment/customer names from the
// API's labels, weekday names, "unknown" as it is.
export function dimensionText(dim, value, labels = {}) {
  if (value === null || value === undefined) return 'unknown';
  if (dim === 'weekday') return WEEKDAYS[Number(value)] || String(value);
  if (dim === 'hour') return `${String(value).padStart(2, '0')}:00`;
  return labels?.[dim]?.[value] || String(value).replace(/_/g, ' ');
}

// A row's group name: its dimension values joined ("Sales · incoming").
export const groupName = (row, dimensions, labels) => dimensions.map((d) => dimensionText(d, row[d], labels)).join(' · ') || 'All calls';

// Bucketed rows → one entry per time, a column per group (split) or per
// measure (no split), which is what a line or stacked bar wants.
export function timeSeries(rows, { dimensions = [], measures = [], labels = {} } = {}) {
  const byTime = new Map();
  const series = new Set();
  (rows || []).forEach((row) => {
    const entry = byTime.get(row.time) || { time: row.time };
    if (dimensions.length) {
      const name = groupName(row, dimensions, labels);
      series.add(name);
      entry[name] = (entry[name] || 0) + (Number(row[measures[0]]) || 0);
    } else {
      measures.forEach((m) => { series.add(m); entry[m] = Number(row[m]) || 0; });
    }
    byTime.set(row.time, entry);
  });
  return { data: [...byTime.values()].sort((a, b) => String(a.time).localeCompare(String(b.time))), series: [...series] };
}

export const cdrQueryReady = (q) => Array.isArray(q?.measures) && q.measures.length > 0;

// The top bar's selection → the report's scope params.
export function scopeParams(scope = {}) {
  if (scope.customerUuid) return { customerUuid: scope.customerUuid };
  const envs = (scope.environmentUuids || (scope.environmentUuid ? [scope.environmentUuid] : [])).filter(Boolean);
  return { environmentUuids: envs };
}
export const hasScope = (scope = {}) => Boolean(scope.fleet || scope.customerUuid || scope.environmentUuid || scope.environmentUuids?.length);
