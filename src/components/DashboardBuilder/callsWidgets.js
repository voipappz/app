// Calls widgets: the dashboard's calls panels as board widgets. Unlike the
// metric widgets (one Influx query each), these read the calls chart the API
// splits by a CDR tag (/api/monitoring/charts?type=calls_volume&group_by=…)
// and follow the customer/application picked in the top bar. `live_calls`
// reads the environment's live state from the node's cable.
import i18n from '../../i18n';

export const CALLS_TYPES = ['calls_stat', 'calls_chart', 'calls_outcome', 'live_calls'];
export const isCallsType = (type) => CALLS_TYPES.includes(type);

// The CDR tags a calls widget can split by, and what a stat widget shows;
// their words are widgets.json groups.<key> and metrics.<key>.
export const CDR_GROUPS = ['direction', 'disposition', 'type', 'hangup_disposition'];
export const groupLabel = (key) => (CDR_GROUPS.includes(key)
  ? i18n.t(`widgets:groups.${key}`)
  : String(key || '').replace(/_/g, ' '));

export const CALLS_METRICS = ['total', 'answered', 'groups', 'busiest'];

export const ANSWERED = /^(answer|answered|contact_answer|normal_clearing)$/i;

// The API's bucket and the chart's axis for a window.
export const bucketFor = (minutes) => {
  if (minutes <= 60) return { bucket: '5m', timeRange: 'hour' };
  if (minutes <= 1440) return { bucket: '1h', timeRange: 'day' };
  return { bucket: '1d', timeRange: 'week' };
};
