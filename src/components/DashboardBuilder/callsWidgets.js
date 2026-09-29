// Calls widgets: the dashboard's calls panels as board widgets. Unlike the
// metric widgets (one Influx query each), these read the calls chart the API
// splits by a CDR tag (/api/monitoring/charts?type=calls_volume&group_by=…)
// and follow the customer/application picked in the top bar. `live_calls`
// reads the environment's live state from the node's cable.
export const CALLS_TYPES = ['calls_stat', 'calls_chart', 'calls_outcome', 'live_calls'];
export const isCallsType = (type) => CALLS_TYPES.includes(type);

export const CDR_GROUPS = [
  { key: 'direction', label: 'Direction' },
  { key: 'disposition', label: 'Disposition' },
  { key: 'type', label: 'Type' },
  { key: 'hangup_disposition', label: 'Hangup disposition' },
];
export const groupLabel = (key) => CDR_GROUPS.find((group) => group.key === key)?.label || String(key || '').replace(/_/g, ' ');

export const CALLS_METRICS = [
  { key: 'total', label: 'Calls' },
  { key: 'answered', label: 'Answered %' },
  { key: 'groups', label: 'Number of groups' },
  { key: 'busiest', label: 'Busiest group' },
];

export const ANSWERED = /^(answer|answered|contact_answer|normal_clearing)$/i;

// The API's bucket and the chart's axis for a window.
export const bucketFor = (minutes) => {
  if (minutes <= 60) return { bucket: '5m', timeRange: 'hour' };
  if (minutes <= 1440) return { bucket: '1h', timeRange: 'day' };
  return { bucket: '1d', timeRange: 'week' };
};
