import { apiService } from '../apiService';

/**
 * Monitoring API service — chart data from the mothership's Monitoring endpoint.
 *
 * Every call here used to go to `/api/dashboard/metrics/*`. That mount was
 * deleted from the mothership (lib/routes.rb: "the dashboard API + its
 * /api/dashboard alias were deleted"), so all of it had been 404ing silently —
 * apiService swallows the failure, the caller gets [], and the chart renders as
 * a flat zero line. Nothing on Monitoring or Live has shown real data since.
 *
 * The live charts now read `/api/monitoring/charts`, which runs the identical
 * EventState.chart_pair / chart_series query AND enforces customer scoping
 * server-side (a non-admin without a customer scope is refused rather than
 * silently served cross-tenant rows).
 *
 * Scoping (server-enforced): environmentUuid (precise) > customerUuid > neither
 * (admin only).
 */

/** Build the ?type=&minutes=&bucket= + scope query for /api/monitoring/charts. */
function chartParams(type, environmentUuid, customerUuid, minutes, bucket) {
  const p = new URLSearchParams({ type, minutes: String(minutes), bucket });
  if (environmentUuid) p.set('environment_uuid', environmentUuid);
  else if (customerUuid) p.set('customer_uuid', customerUuid);
  return p;
}

export const monitoringApi = {
  getLiveCallsChart: async (environmentUuid, minutes = 30, bucket = '5m', customerUuid = null) =>
    apiService.get(
      `/api/monitoring/charts?${chartParams('live_calls', environmentUuid, customerUuid, minutes, bucket)}`,
      {}, 'fetching live calls chart', false, true),

  getLiveRegistrationsChart: async (environmentUuid, minutes = 30, bucket = '5m', customerUuid = null) =>
    apiService.get(
      `/api/monitoring/charts?${chartParams('live_registrations', environmentUuid, customerUuid, minutes, bucket)}`,
      {}, 'fetching live registrations chart', false, true),

  /**
   * Finished calls per bucket from the InfluxDB `cdr` series — what telegraf
   * already receives for every call, counted per customer. `groupBy` splits
   * the bars: direction | cause | disposition | hangup_disposition.
   */
  getCallsVolumeChart: async (environmentUuid, minutes = 1440, bucket = '1h', customerUuid = null, groupBy = 'direction') => {
    const params = chartParams('calls_volume', environmentUuid, customerUuid, minutes, bucket);
    if (groupBy) params.set('group_by', groupBy);
    return apiService.get(`/api/monitoring/charts?${params}`, {}, 'fetching calls volume chart', false, true);
  },

  // Influx/Influxer is Monitoring-only. Schema browser + Influxer-built metric query.
  getInfluxSchema: async () => apiService.get('/api/monitoring/influxdb/schema', {}, 'fetching influx schema', false, true),

  // Structured Yabeda/Prometheus registry for the API metrics viewer.
  getYabedaMetrics: async () => apiService.get('/api/monitoring/metrics', {}, 'fetching API metrics', false, true),

  /**
   * Raw POINTS of a measurement — for listing rows (e.g. cdr call records),
   * which runInfluxQuery cannot do: that one only ever answers with one
   * aggregated number per time bucket. Tenant scoping is enforced
   * server-side from the session, so there's nothing to pass here.
   *
   * Only exists on API builds carrying voipappz-api ddaa69d05; older
   * deployments 404, so callers must have a fallback.
   */
  getInfluxRows: async ({ measurement, minutes = 1440, limit = 100, environmentUuid = '' } = {}) => {
    const qs = new URLSearchParams({ measurement, minutes: String(minutes), limit: String(limit) });
    if (environmentUuid) qs.append('environment_uuid', environmentUuid);
    return apiService.get(`/api/monitoring/influxdb/rows?${qs.toString()}`, {}, 'fetching influx rows', false, true);
  },

  // environmentUuid narrows inside the session's tenant scope (the server
  // applies it after its own filter); a portal user's token ignores it.
  // `where` ({ tag: value }) filters by tag value and `groupBy` (a tag) splits
  // the answer into one series per value — both checked server-side against
  // the measurement's real tags, and ANDed with the tenant scope.
  runInfluxQuery: async ({ measurement, field, aggregation = 'mean', host = '', minutes = 60, bucket = '', environmentUuid = '', where = null, groupBy = '' } = {}) => {
    const qs = new URLSearchParams({ measurement, field, aggregation, minutes: String(minutes) });
    if (host) qs.append('host', host);
    if (bucket) qs.append('bucket', bucket);
    if (environmentUuid) qs.append('environment_uuid', environmentUuid);
    Object.entries(where || {}).forEach(([tag, value]) => { if (tag && value !== '' && value != null) qs.append(`where[${tag}]`, String(value)); });
    if (groupBy) qs.append('group_by', groupBy);
    return apiService.get(`/api/monitoring/influxdb/query?${qs.toString()}`, {}, 'running metric query', false, true);
  },

  // The values one tag has in the caller's own data (last `minutes`, 7 days
  // by default) — for the widget builder's filter and split-by pickers.
  getInfluxTagValues: async ({ measurement, tag, minutes = 10080 } = {}) => {
    const qs = new URLSearchParams({ measurement, tag, minutes: String(minutes) });
    const res = await apiService.get(`/api/monitoring/influxdb/tag_values?${qs.toString()}`, {}, 'fetching tag values', false, true);
    return Array.isArray(res?.values) ? res.values : [];
  },

  // The CDR report (InfluxDB `cdr` over SQL, built by the API from names —
  // see voipappz-api InfluxDB::CdrReport). What this deployment can answer:
  getCdrCatalog: async () => apiService.get('/api/monitoring/cdr/catalog', {}, 'fetching CDR catalog', false, true),

  // Call-centre measures grouped by CDR dimensions. Scope: environmentUuids
  // (the ones picked) > customerUuid > neither (root: every customer); the
  // server only ever narrows the session's own scope with them.
  runCdrReport: async ({ measures = ['calls'], dimensions = [], bucket = '', minutes = 1440, where = {}, order = '', limit = 100, slSeconds = 20, environmentUuids = [], customerUuid = '' } = {}) => {
    const qs = new URLSearchParams({ minutes: String(minutes), limit: String(limit), sl_seconds: String(slSeconds) });
    measures.forEach((m) => qs.append('measures[]', m));
    dimensions.forEach((d) => qs.append('dimensions[]', d));
    if (bucket) qs.append('bucket', bucket);
    if (order) qs.append('order', order);
    Object.entries(where || {}).forEach(([dim, value]) => {
      const list = Array.isArray(value) ? value : [value];
      const joined = list.filter((v) => v !== '' && v != null).map(String).join(',');
      if (joined) qs.append(`where[${dim}]`, joined);
    });
    if (environmentUuids.length) qs.append('environment_uuids', environmentUuids.join(','));
    else if (customerUuid) qs.append('customer_uuid', customerUuid);
    return apiService.get(`/api/monitoring/cdr/report?${qs.toString()}`, {}, 'running CDR report', false, true);
  },

  // Hand-written SQL — root accounts only (the API refuses anyone else).
  runCdrSql: async (sql) => apiService.post('/api/monitoring/cdr/sql', new URLSearchParams({ sql }),
    { 'Content-Type': 'application/x-www-form-urlencoded' }, 'running SQL', false, true),
};

export default monitoringApi;
