/**
 * Widget templates — ready-made definitions for the local dashboard.
 *
 * Ported from nimbus-admin's `widgetTemplates.js`, but every metric is re-keyed
 * to what THIS backend actually serves: the deno `/dashboard/snapshot`
 * projection (`stats` keys, `calls_per_hour` series, `recent_calls` columns).
 * Nimbus's `agents.*` / `queue.*` / InfluxDB SQL templates are deliberately
 * absent — nothing here produces them.
 *
 * A template is a partial widget definition; `applyTemplate` merges it over the
 * defaults so an unset field never leaks from the previously edited widget.
 */

/** Widget type → the snapshot section it reads. */
export const SOURCE_BY_TYPE = {
  counter: 'stats',
  gauge: 'stats',
  trend: 'calls_per_hour',
  table: 'recent_calls',
};

export const WIDGET_TYPES = ['counter', 'gauge', 'trend', 'table'];

/** Blank widget — every field the editor can touch, so merges are total. */
export const DEFAULT_WIDGET = {
  title: '',
  type: 'counter',
  metric: 'total',
  fields: [],
  icon: 'Call',
  color: '',
  unit: '',
  thresholds: { warning: 70, critical: 90 },
  inverse: false,
  min: 0,
  max: 100,
};

export const WIDGET_TEMPLATES = {
  // Counters over DashboardSnapshot.stats
  totalCalls: {
    title: 'Total calls', type: 'counter', metric: 'total',
    icon: 'Call', color: '', unit: 'calls',
  },
  answeredCalls: {
    title: 'Answered', type: 'counter', metric: 'answered',
    icon: 'CheckCircle', color: 'success.main', unit: 'calls',
  },
  failedCalls: {
    title: 'Failed / missed', type: 'counter', metric: 'failed',
    icon: 'PhoneMissed', color: 'error.main', unit: 'calls',
    thresholds: { warning: 5, critical: 20 },
  },
  inboundCalls: {
    title: 'Inbound', type: 'counter', metric: 'inbound',
    icon: 'CallReceived', color: 'info.main', unit: 'calls',
  },
  outboundCalls: {
    title: 'Outbound', type: 'counter', metric: 'outbound',
    icon: 'CallMade', color: 'warning.main', unit: 'calls',
  },
  avgDuration: {
    title: 'Avg duration', type: 'counter', metric: 'avg_duration_sec',
    icon: 'Timer', color: 'info.main',
  },

  // Gauges — same stats, bounded + threshold-coloured
  failureGauge: {
    title: 'Failed calls', type: 'gauge', metric: 'failed',
    min: 0, max: 50, thresholds: { warning: 10, critical: 25 }, unit: 'calls',
  },
  handleTimeGauge: {
    title: 'Avg handle time', type: 'gauge', metric: 'avg_duration_sec',
    min: 0, max: 600, thresholds: { warning: 180, critical: 300 }, unit: 'sec',
  },

  // Trend — the calls_per_hour projection
  callsPerHour: {
    title: 'Calls per hour', type: 'trend', fields: ['inbound', 'outbound'],
  },
  inboundPerHour: {
    title: 'Inbound per hour', type: 'trend', fields: ['inbound'],
  },

  // Table — the recent_calls rows
  recentCalls: {
    title: 'Recent calls', type: 'table',
    fields: ['started_at', 'direction', 'from_number', 'to_number', 'status', 'duration_sec'],
  },
  recentFailures: {
    title: 'Recent calls (compact)', type: 'table',
    fields: ['started_at', 'from_number', 'status'],
  },
};

/** Template keys grouped for the editor's chip row. */
export const TEMPLATE_CATEGORIES = {
  counters: ['totalCalls', 'answeredCalls', 'failedCalls', 'inboundCalls', 'outboundCalls', 'avgDuration'],
  gauges: ['failureGauge', 'handleTimeGauge'],
  trends: ['callsPerHour', 'inboundPerHour'],
  tables: ['recentCalls', 'recentFailures'],
};

/**
 * Merge a template over the defaults. `overrides` (e.g. the widget's uuid and
 * position) survive the merge so applying a template to an existing widget
 * re-styles it in place instead of orphaning it.
 */
export function applyTemplate(templateKey, overrides = {}) {
  const template = WIDGET_TEMPLATES[templateKey];
  if (!template) return { ...DEFAULT_WIDGET, ...overrides };
  return {
    ...DEFAULT_WIDGET,
    ...template,
    thresholds: { ...DEFAULT_WIDGET.thresholds, ...(template.thresholds || {}) },
    fields: [...(template.fields || [])],
    ...overrides,
  };
}

/** Fill a stored (possibly older/partial) definition out to the full shape. */
export function withDefaults(widget = {}) {
  return {
    ...DEFAULT_WIDGET,
    ...widget,
    type: WIDGET_TYPES.includes(widget.type) ? widget.type : DEFAULT_WIDGET.type,
    thresholds: { ...DEFAULT_WIDGET.thresholds, ...(widget.thresholds || {}) },
    fields: Array.isArray(widget.fields) ? [...widget.fields] : [],
  };
}

export default WIDGET_TEMPLATES;
