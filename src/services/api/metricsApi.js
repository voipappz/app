/**
 * Health API.
 *
 * This module used to expose ~25 methods against `/api/dashboard/metrics/*`
 * (cpu, memory, disk, docker, postgresql, redis, ping, kong, nats, freeswitch,
 * kamailio, minio, cert, dns, …). That mount no longer exists on the mothership
 * — lib/routes.rb reads "(Removed) The dashboard API + its /api/dashboard alias
 * were deleted" — so every one of them returned 404. apiService swallows the
 * failure and hands back null, which is why every Monitoring card read 0.
 *
 * What replaces them:
 *   syslog counts / severity aggregation → syslogsApi (`/api/logs/*`)
 *   host metrics (cpu, mem, disk, system) → monitoringApi.runInfluxQuery, which
 *     the server builds from the Influxer models in lib/models/influxdb/
 *   on-demand detailed service health    → getDetailedHealth, below
 */
export const metricsApi = {
  /**
   * The mothership's /health/detailed — the full check suite (database, redis,
   * nats, influxdb/postgres freshness, …) with thresholds from
   * config/alerts.yaml. Normalized so callers keep reading
   * { status, duration_ms, checks } at the top level while the extra detail
   * (system_metrics, scheduler, environment, report) is preserved.
   *
   * Uses fetch directly rather than apiService: a failing backend must surface
   * here, not be swallowed the way a data call is.
   *
   * /api/health/detailed, NOT /health/detailed: at the mothership's Kong
   * /health is GATUS and the API's health is under /api/health (mothership
   * f12d37a, 2026-09-15). /health/detailed reached Gatus, which answered
   * "Cannot GET …", and the panel showed a JSON parse error.
   */
  getDetailedHealth: async () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const url = `${baseUrl}/api/health/detailed`;
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    const headers = { 'Accept': 'application/json' };
    if (auth.access) headers['Authorization'] = `Bearer ${auth.access}`;
    const resp = await fetch(url, { method: 'GET', headers });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error(`/api/health/detailed answered HTTP ${resp.status} without JSON: ${text.slice(0, 80)}`);
      error.status = resp.status;
      throw error;
    }
    const normalized = {
      ...data,
      http_status: resp.status,
      status: data?.overall?.status ?? data?.status,
      healthy: data?.overall?.healthy ?? data?.healthy,
      duration_ms: data?.overall?.duration_ms ?? data?.duration_ms,
      checks: data?.checks,
    };
    if (!resp.ok) {
      const error = new Error(data?.message || data?.error || `Health check failed (HTTP ${resp.status})`);
      error.status = resp.status;
      error.data = normalized;
      throw error;
    }
    return normalized;
  },
};

export default metricsApi;
