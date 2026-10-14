import { apiService } from '../apiService';

// Syslog API — /api/logs reads the application's InfluxDB `syslog`
// measurement (the former /api/syslogs path has no alias).
const BASE = '/api/logs';

/**
 * Build a URLSearchParams string from the common syslogs query shape.
 * Only non-empty values are appended.
 */
const buildQuery = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.page != null)      qs.append('page', params.page);
  if (params.per_page != null)  qs.append('per_page', params.per_page);
  if (params.from != null)      qs.append('from', params.from);
  if (params.to != null)        qs.append('to', params.to);
  if (params.app)               qs.append('app', params.app);
  if (params.host)              qs.append('host', params.host);
  if (params.severity)          qs.append('severity', params.severity);
  if (params.action)            qs.append('action', params.action);
  if (params.customer_uuid)     qs.append('customer_uuid', params.customer_uuid);
  if (params.inline)            qs.append('inline', params.inline);
  if (params.subject_uuid)      qs.append('subject_uuid', params.subject_uuid);
  if (params.interval)          qs.append('interval', params.interval);
  if (params.group_by)          qs.append('group_by', params.group_by);
  return qs.toString();
};

export const syslogsApi = {
  // All syslog calls skip the circuit breaker — InfluxDB failures must not
  // poison the global circuit breaker and block unrelated API requests.
  fetchLogs: (params = {}) => {
    const qs = buildQuery({
      page: params.page || 1,
      per_page: params.per_page || 50,
      from: params.from,
      to: params.to,
      app: params.app,
      host: params.host,
      severity: params.severity,
      action: params.action,
      customer_uuid: params.customer_uuid,
      inline: params.inline,
      subject_uuid: params.subject_uuid,
    });
    return apiService.get(`${BASE}?${qs}`, {}, 'fetching syslogs', false, true);
  },

  fetchAggregate: (params = {}) => {
    const qs = buildQuery({
      from: params.from,
      to: params.to,
      app: params.app,
      host: params.host,
      severity: params.severity,
      action: params.action,
      customer_uuid: params.customer_uuid,
      inline: params.inline,
      interval: params.interval,
      group_by: params.group_by,
    });
    return apiService.get(`${BASE}/aggregate?${qs}`, {}, 'fetching syslog aggregate', false, true);
  },

  /**
   * Per-(app, severity) counts over the window: [{ app, severity, latest_value }].
   * This is the aggregation the Monitoring cards and the App Breakdown table read.
   * `bucket` is accepted for call-site symmetry; the server aggregates the whole
   * window into one row per pair, so it does not affect the result.
   */
  fetchMetrics: ({ from, to, host } = {}) => {
    const qs = new URLSearchParams();
    if (from != null) qs.append('from', from);
    if (to != null) qs.append('to', to);
    if (host) qs.append('host', host);
    return apiService.get(`${BASE}/metrics?${qs}`, {}, 'fetching syslog metrics', false, true);
  },

  /** Mothership log forwarding (Vector → InfluxDB) on/off. */
  getMonitoringStatus: () =>
    apiService.get(`${BASE}/monitoring`, {}, 'fetching syslog monitoring status', false, true),

  setMonitoring: (enabled) =>
    enabled
      ? apiService.post(`${BASE}/monitoring`, {}, {}, 'enabling syslog monitoring', false, true)
      : apiService.delete(`${BASE}/monitoring`, {}, 'disabling syslog monitoring', false, true),

  /** App error-rate breaches: [{ app, count, window, threshold, level }]. */
  fetchAlerts: () =>
    apiService.get(`${BASE}/alerts`, {}, 'fetching log alerts', false, true),

  fetchApps: (customerUuid = null) => {
    const qs = new URLSearchParams();
    if (customerUuid) qs.set('customer_uuid', customerUuid);
    const suffix = qs.toString();
    return apiService.get(`${BASE}/apps${suffix ? `?${suffix}` : ''}`, {}, 'fetching syslog apps', false, true);
  },

  fetchNodes: () =>
    apiService.get(`${BASE}/nodes`, {}, 'fetching syslog nodes', false, true),

  /**
   * Message types seen in the window: [{ action, count }], most frequent first.
   * The `action` tag carries a line's action (did.updated, node.license_invalid)
   * or, for a node line that names none, its request kind (sip_auth, dialplan,
   * sofia.conf). This feeds the Type filter.
   */
  fetchActions: ({ from, to, customer_uuid } = {}) => {
    const qs = buildQuery({ from, to, customer_uuid });
    return apiService.get(`${BASE}/actions${qs ? `?${qs}` : ''}`, {}, 'fetching syslog message types', false, true);
  },

  getTraceStatus: () =>
    apiService.get(`${BASE}/trace`, {}, 'checking syslog trace status', false, true),

  enableTrace: () =>
    apiService.post(`${BASE}/trace`, {}, {}, 'enabling syslog trace', false, true),

  disableTrace: () =>
    apiService.delete(`${BASE}/trace`, {}, 'disabling syslog trace', false, true),

  getConsoleStatus: () =>
    apiService.get(`${BASE}/console`, {}, 'checking console mode status', false, true),

  enableConsole: () =>
    apiService.post(`${BASE}/console`, {}, {}, 'enabling console mode', false, true),

  disableConsole: () =>
    apiService.delete(`${BASE}/console`, {}, 'disabling console mode', false, true),
};

export default syslogsApi;
