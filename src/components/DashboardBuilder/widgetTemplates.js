/**
 * Widget templates — ready-made definitions for the dashboard builder.
 *
 * Each widget is a self-sufficient InfluxDB query — {measurement, field,
 * aggregation, minutes} — the exact same shape InfluxMetricExplorer already
 * queries with (src/components/Monitoring/InfluxMetricExplorer). A definition
 * is only ever metadata; the VALUE always comes from a live
 * monitoringApi.runInfluxQuery() call (see useWidgetValue.js), never stored
 * here. The one exception is the 'table' type, which reads recent_calls rows
 * (Postgres, via useDashboardSnapshot) — InfluxDB has no row-level call data.
 */

export const WIDGET_TYPES = ['counter', 'gauge', 'stat', 'trend', 'line', 'bar', 'pie', 'table', 'explorer'];

// Widget type → whether it's a live Influx metric query or the calls table.
export const isInfluxType = (type) => type !== 'table';

/** Blank widget — every field the editor can touch, so merges are total. */
export const DEFAULT_WIDGET = {
  title: '',
  type: 'counter',
  // Starts on a measurement/field this platform actually has, so a blank
  // widget shows a real number instead of nothing until it's pointed
  // somewhere else via FieldSelect's live schema picker.
  measurement: 'live_state',
  field: 'calls_total',
  aggregation: 'max',
  minutes: 60,
  fields: [], // table type only — recent_calls columns
  icon: 'Call',
  color: '',
  unit: '',
  thresholds: { warning: 70, critical: 90 },
  inverse: false,
  min: 0,
  max: 100
};

// Measurements/fields below are the ones this platform's InfluxDB actually
// has — verified live against /api/monitoring/influxdb/schema, which reports
// exactly three measurements:
//   live_state — calls_incoming, calls_outgoing, calls_total, extensions_total
//   cdr        — duration, talk_duration, billed, rate, balance, caller, ...
//   syslog     — message
// (An earlier draft of this file pointed at a `queue_identity` measurement
// that does not exist here; every template built on it returned nothing.)
// "Today" = minutes since local midnight, resolved when a template is applied
// (a fixed number can't express it). Falls back to a full day at midnight
// itself so a widget added at 00:00 still has a window to query.
export const minutesSinceMidnight = (now = new Date()) => {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Math.max(60, Math.round((now - midnight) / 60000));
};

export const WIDGET_TEMPLATES = {
  // Every widget here reads InfluxDB through /api/monitoring/influxdb/query.
  // The portal has no second data path on purpose: there used to be three
  // "right now" presets served by /api/{calls,users,extensions}?action=live,
  // and they were dropped so the whole screen has one story about where its
  // numbers come from. `live_state` is sampled once a minute, so "in
  // progress" is up to a minute behind — the accepted cost.
  callsInProgress: {
    title: 'Calls in progress', type: 'counter',
    measurement: 'live_state', field: 'calls_total', aggregation: 'last',
    minutes: 15,
    icon: 'Call', color: 'success.main', unit: 'calls'
  },

  // COUNTS come from cdr — one point per completed call, so count() is a
  // genuine call count. They used to read max(live_state.calls_total), which
  // is a gauge of CONCURRENT calls: a tenant handling 376 calls but never
  // more than two at once saw "Calls today: 2". The titles were lying.
  //
  // These need voipappz-api 12c3bc465 deployed (quote the field identifier —
  // `duration` is an InfluxQL keyword, so unquoted every cdr aggregation
  // failed to parse). Older APIs read empty rather than wrong.
  callsToday: {
    title: 'Calls today', type: 'counter',
    measurement: 'cdr', field: 'duration', aggregation: 'count',
    minutes: 'today',
    icon: 'Call', color: '', unit: 'calls'
  },
  totalCalls: {
    title: 'Calls (last hour)', type: 'counter',
    measurement: 'cdr', field: 'duration', aggregation: 'count',
    minutes: 60,
    icon: 'Call', color: '', unit: 'calls'
  },

  // PEAKS stay on live_state, but say so. /influxdb/query takes no tag
  // filter, so cdr's `direction` tag can't split a count by direction —
  // these are the concurrency peaks, which is a different question and an
  // honest one.
  peakIncoming: {
    title: 'Peak incoming at once', type: 'counter',
    measurement: 'live_state', field: 'calls_incoming', aggregation: 'max',
    minutes: 'today',
    icon: 'CallReceived', color: 'info.main', unit: 'calls'
  },
  peakOutgoing: {
    title: 'Peak outgoing at once', type: 'counter',
    measurement: 'live_state', field: 'calls_outgoing', aggregation: 'max',
    minutes: 'today',
    icon: 'CallMade', color: 'success.main', unit: 'calls'
  },
  extensionsTotal: {
    title: 'Extensions', type: 'counter',
    measurement: 'live_state', field: 'extensions_total', aggregation: 'last',
    icon: 'Insights', color: 'info.main'
  },
  // These two need voipappz-api commit 12c3bc465 (quote the field identifier
  // in the InfluxQL select) deployed: `duration` is an InfluxQL keyword, so
  // unquoted every cdr aggregation 500'd at parse time. They'll read empty,
  // not error, on an API older than that.
  //
  // Call-centre metrics (waiting time, abandoned %, service level, agent
  // Break/Talking/Ready counts) are a different matter — this InfluxDB has
  // only live_state, cdr and syslog, with no queue or agent-state
  // measurement to read them from at all.
  avgCallDuration: {
    title: 'Avg call duration', type: 'counter',
    measurement: 'cdr', field: 'duration', aggregation: 'mean',
    icon: 'Timer', color: 'info.main'
  },
  avgTalkTime: {
    title: 'Avg talk time', type: 'counter',
    measurement: 'cdr', field: 'talk_duration', aggregation: 'mean',
    icon: 'Timer', color: 'info.main'
  },
  concurrentCallsGauge: {
    title: 'Concurrent calls', type: 'gauge',
    measurement: 'live_state', field: 'calls_total', aggregation: 'max',
    min: 0, max: 50, thresholds: { warning: 25, critical: 40 }, unit: 'calls'
  },
  callVolumeTrend: {
    title: 'Call volume', type: 'bar',
    measurement: 'live_state', field: 'calls_total', aggregation: 'max', minutes: 1440
  },
  recentCalls: {
    title: 'Recent calls', type: 'table',
    fields: ['started_at', 'direction', 'from_number', 'to_number', 'status', 'duration_sec']
  },
  // The Monitoring metric explorer pinned to the board: the saved query is
  // where it opens, and it runs only when asked.
  metricExplorer: {
    title: 'Metric explorer', type: 'explorer',
    measurement: 'cdr', field: 'duration', aggregation: 'mean', minutes: 60,
    icon: 'Insights'
  }
};

/** Template keys grouped for the editor's quick-start chip row. */
export const TEMPLATE_CATEGORIES = {
  live: ['callsInProgress'],
  counters: ['callsToday', 'totalCalls', 'peakIncoming', 'peakOutgoing', 'extensionsTotal', 'avgCallDuration', 'avgTalkTime'],
  gauges: ['concurrentCallsGauge'],
  trends: ['callVolumeTrend'],
  tables: ['recentCalls'],
  explore: ['metricExplorer']
};

/**
 * Merge a template over the defaults. `overrides` (e.g. the widget's uuid and
 * dashboard_uuid) survive the merge so applying a template to an existing
 * widget re-styles it in place instead of orphaning it.
 */
export function applyTemplate(templateKey, overrides = {}) {
  const template = WIDGET_TEMPLATES[templateKey];
  if (!template) return { ...DEFAULT_WIDGET, ...overrides };
  return {
    ...DEFAULT_WIDGET,
    ...template,
    // 'today' is a symbolic window — resolve it to real minutes at the moment
    // the widget is created (see minutesSinceMidnight).
    minutes: template.minutes === 'today' ? minutesSinceMidnight() : (template.minutes ?? DEFAULT_WIDGET.minutes),
    thresholds: { ...DEFAULT_WIDGET.thresholds, ...(template.thresholds || {}) },
    fields: [...(template.fields || [])],
    ...overrides
  };
}

/** Fill a stored (possibly older/partial) definition out to the full shape. */
export function withDefaults(widget = {}) {
  return {
    ...DEFAULT_WIDGET,
    ...widget,
    type: WIDGET_TYPES.includes(widget.type) ? widget.type : DEFAULT_WIDGET.type,
    thresholds: { ...DEFAULT_WIDGET.thresholds, ...(widget.thresholds || {}) },
    fields: Array.isArray(widget.fields) ? [...widget.fields] : []
  };
}

export default WIDGET_TEMPLATES;
