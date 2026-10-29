// Shared by the widget builder and the 'query' widget it saves: a query is
// { measurement, field, aggregation, minutes, where: { tag: value }, splitBy }
// and always runs through voipappz-api (/monitoring/influxdb/query), which
// checks every tag against the measurement and applies the tenant scope.
export const AGGREGATIONS = ['mean', 'sum', 'count', 'max', 'min', 'last', 'first'];
// The time ranges a query can cover, in minutes; their words are widgets.json
// ranges.<minutes>.
export const RANGES = [15, 60, 360, 1440, 10080, 43200];
export const VIEWS = ['line', 'bar', 'number', 'table'];

// Rows come back as { time, value, <tag>? } — one per time bucket and series.
// The chart wants one row per time with a column per series.
export function pivot(rows, splitBy) {
  const list = Array.isArray(rows) ? rows : [];
  const key = splitBy || (list.some((row) => row.host != null) ? 'host' : null);
  const byTime = new Map();
  const series = new Set();
  list.forEach((row) => {
    const name = key ? String(row[key] ?? '—') : 'value';
    series.add(name);
    const entry = byTime.get(row.time) || { time: row.time };
    const value = row.value === null || row.value === undefined || row.value === '' ? null : Number(row.value);
    entry[name] = Number.isFinite(value) ? value : null;
    byTime.set(row.time, entry);
  });
  const data = [...byTime.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
  return { data, series: [...series] };
}

// One number for the whole window: totals add up, peaks take the peak,
// anything else reads the latest bucket (summed across series).
export function summarize(rows, aggregation) {
  const { data, series } = pivot(rows);
  const perTime = data.map((entry) => series.reduce((sum, name) => sum + (entry[name] ?? 0), 0));
  if (!perTime.length) return null;
  if (aggregation === 'count' || aggregation === 'sum') return perTime.reduce((a, b) => a + b, 0);
  if (aggregation === 'max') return Math.max(...perTime);
  if (aggregation === 'min') return Math.min(...perTime);
  return perTime[perTime.length - 1];
}

export const queryReady = (q) => Boolean(q?.measurement && q?.field);
