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
import { isCallsType } from './callsWidgets';
import i18n from '../../i18n';

export const WIDGET_TYPES = ['counter', 'gauge', 'stat', 'trend', 'line', 'bar', 'pie', 'table', 'explorer',
  // Calls widgets (callsWidgets.js): the calls chart split by a CDR tag, and live calls.
  'calls_stat', 'calls_chart', 'calls_outcome', 'live_calls',
  // Built in the widget builder: a metric query with tag filters and a split.
  'query',
  // Saved from the report editor: a CDR report (cdrReport.js, Monitoring) or
  // an activity report over identities (reportSources.js, the Dashboard).
  'cdr', 'identity',
  // A section of the Live screen, drawn from the cable (LiveDashboard's renderLive).
  'live'];

// Widget type → whether it's a live Influx metric query or the calls table.
export const isInfluxType = (type) => type !== 'table' && type !== 'identity' && type !== 'cdr' && type !== 'live' && !isCallsType(type);

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
  max: 100,
  // Calls widgets only: the CDR tag to split by, and which number a
  // calls_stat shows (total | answered | groups | busiest).
  groupBy: 'direction',
  metric: 'total',
  // Query widgets only (WidgetBuilder): tag filters, split-by tag, and view.
  where: {},
  splitBy: '',
  view: 'line',
  // CDR report widgets only (CdrEditor): measures, group-by fields, time bucket.
  measures: [],
  dimensions: [],
  bucket: ''
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
  // The dashboard's calls panels. They follow the customer/application picked
  // in the top bar, and split calls by a CDR tag (direction, disposition…).
  callsTotal: {
    title: 'Calls', type: 'calls_stat', metric: 'total', groupBy: 'direction', minutes: 1440, icon: 'Call'
  },
  callsAnswered: {
    title: 'Answered', type: 'calls_stat', metric: 'answered', groupBy: 'disposition', minutes: 1440, icon: 'Call'
  },
  callsGroups: {
    title: 'Directions', type: 'calls_stat', metric: 'groups', groupBy: 'direction', minutes: 1440, icon: 'Call'
  },
  callsBusiest: {
    title: 'Most calls by direction', type: 'calls_stat', metric: 'busiest', groupBy: 'direction', minutes: 1440, icon: 'CallMade'
  },
  callsByDirection: {
    title: 'Calls by direction', type: 'calls_chart', groupBy: 'direction', minutes: 1440, icon: 'Insights'
  },
  callsOutcome: {
    title: 'How they ended', type: 'calls_outcome', groupBy: 'disposition', minutes: 1440, icon: 'Insights'
  },
  liveCalls: {
    title: 'Live calls', type: 'live_calls', icon: 'Call'
  },
  // CDR report widgets — the dashboard's call-centre KPIs, from the query
  // editor's report (InfluxDB `cdr`, grouped by any CDR field).
  // The Dashboard: the live stream's history from Postgres `identities`
  // (/api/identities/report). Fixed measures only — a deployment that has not
  // seen a delta yet has no discovered field:/incr: keys to name.
  // The Live screen's sections, as widgets: the cable's documents, never the
  // API (LiveDashboard draws them by `section`).
  liveSummary: { title: 'Status summary', type: 'live', section: 'summary' },
  liveTiles: { title: 'At a glance', type: 'live', section: 'tiles' },
  liveCallCounts: { title: 'Calls by direction', type: 'live', section: 'callCounts' },
  liveCallsInProgress: { title: 'Calls in progress', type: 'live', section: 'callsInProgress' },
  liveAgents: { title: 'Agents', type: 'live', section: 'agents' },
  idActivity: {
    title: 'Activity, last 24 hours', type: 'identity', view: 'number', minutes: 1440,
    measures: ['events', 'identities'], dimensions: []
  },
  idByType: {
    title: 'Activity by type', type: 'identity', view: 'table', minutes: 1440, limit: 20,
    measures: ['events', 'identities'], dimensions: ['type']
  },
  idOverTime: {
    title: 'Activity over time', type: 'identity', view: 'line', minutes: 1440, bucket: '1h',
    measures: ['events'], dimensions: ['type']
  },
  idTopEvents: {
    title: 'Top events', type: 'identity', view: 'bar', minutes: 1440, limit: 10,
    measures: ['events'], dimensions: ['event']
  },
  idByHour: {
    title: 'Busiest hours', type: 'identity', view: 'bar', minutes: 10080, limit: 24,
    measures: ['events'], dimensions: ['hour']
  },
  cdrKpis: {
    title: 'Today at a glance', type: 'cdr', view: 'number', minutes: 1440,
    measures: ['calls', 'answer_rate', 'billsec', 'avg_talk', 'avg_wait', 'service_level'], dimensions: []
  },
  cdrByEnvironment: {
    title: 'Calls by environment', type: 'cdr', view: 'table', minutes: 1440, limit: 50,
    measures: ['calls', 'answered', 'answer_rate', 'billsec', 'avg_talk', 'abandon_rate', 'billed'], dimensions: ['environment']
  },
  cdrStatusOverTime: {
    title: 'Status over time', type: 'cdr', view: 'bar', minutes: 1440, bucket: '1h',
    measures: ['calls'], dimensions: ['status']
  },
  cdrTopCallers: {
    title: 'Top callers', type: 'cdr', view: 'table', minutes: 1440, limit: 10,
    measures: ['calls', 'billsec', 'answer_rate'], dimensions: ['caller']
  },
  cdrTopCallees: {
    title: 'Top callees', type: 'cdr', view: 'table', minutes: 1440, limit: 10,
    measures: ['calls', 'billsec', 'answer_rate'], dimensions: ['callee']
  },
  cdrByHour: {
    title: 'Calls by hour of day', type: 'cdr', view: 'bar', minutes: 1440,
    measures: ['calls'], dimensions: ['hour']
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
  liveNow: ['liveSummary', 'liveTiles', 'liveCallCounts', 'liveCallsInProgress', 'liveAgents'],
  identities: ['idActivity', 'idByType', 'idOverTime', 'idTopEvents', 'idByHour'],
  reports: ['cdrKpis', 'cdrByEnvironment', 'cdrStatusOverTime', 'cdrTopCallers', 'cdrTopCallees', 'cdrByHour'],
  calls: ['liveCalls', 'callsTotal', 'callsAnswered', 'callsGroups', 'callsBusiest', 'callsByDirection', 'callsOutcome'],
  live: ['callsInProgress'],
  counters: ['callsToday', 'totalCalls', 'peakIncoming', 'peakOutgoing', 'extensionsTotal', 'avgCallDuration', 'avgTalkTime'],
  gauges: ['concurrentCallsGauge'],
  trends: ['callVolumeTrend'],
  tables: ['recentCalls'],
  explore: ['metricExplorer']
};

/** A template's title in the active language (widgets.json templates.<key>). */
export const templateTitle = (templateKey) => i18n.t(`widgets:templates.${templateKey}`, {
  defaultValue: WIDGET_TEMPLATES[templateKey]?.title || templateKey,
});

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
    // Which template it came from: its title follows the language until the
    // person names it (customTitle), see displayTitle.
    template: templateKey,
    // The new widget's own words, in the language it is made in; once saved
    // they are the person's to edit, like any title.
    title: templateTitle(templateKey),
    unit: template.unit ? i18n.t(`widgets:units.${template.unit}`, { defaultValue: template.unit }) : (template.unit ?? DEFAULT_WIDGET.unit),
    // 'today' is a symbolic window — resolve it to real minutes at the moment
    // the widget is created (see minutesSinceMidnight).
    minutes: template.minutes === 'today' ? minutesSinceMidnight() : (template.minutes ?? DEFAULT_WIDGET.minutes),
    thresholds: { ...DEFAULT_WIDGET.thresholds, ...(template.thresholds || {}) },
    fields: [...(template.fields || [])],
    measures: [...(template.measures || [])],
    dimensions: [...(template.dimensions || [])],
    ...overrides
  };
}

/** The title to show: the person's own, or the template's in today's language. */
export const displayTitle = (widget = {}) => (!widget.customTitle && widget.template && WIDGET_TEMPLATES[widget.template]
  ? templateTitle(widget.template) : widget.title);

/** Fill a stored (possibly older/partial) definition out to the full shape. */
export function withDefaults(widget = {}) {
  return {
    ...DEFAULT_WIDGET,
    ...widget,
    type: WIDGET_TYPES.includes(widget.type) ? widget.type : DEFAULT_WIDGET.type,
    thresholds: { ...DEFAULT_WIDGET.thresholds, ...(widget.thresholds || {}) },
    fields: Array.isArray(widget.fields) ? [...widget.fields] : [],
    where: widget.where && typeof widget.where === 'object' ? { ...widget.where } : {},
    measures: Array.isArray(widget.measures) ? [...widget.measures] : [],
    dimensions: Array.isArray(widget.dimensions) ? [...widget.dimensions] : []
  };
}

export default WIDGET_TEMPLATES;
