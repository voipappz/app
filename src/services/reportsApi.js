// Reports API module — the voipappz-api reports engine (server-side aggregation).
// Port of nimbus-admin's services/api/reportsApi.js, using this app's apiGet.
// Verified live on MTN:
//   GET /api/reports/dashboards
//     → { dashboards: [{ category, count, reports: [{name, type}] }] }
//   GET /api/reports/dashboards/:category?start_date&end_date   (epoch SECONDS)
//     → { category, reports: [{ name, type, columns, rows, chart }] }
// That {columns, rows, chart} shape is what ReportChart renders directly.
import { apiGet } from '../lib/clients/api';

/** Categories + report counts for the dashboard tabs. */
export async function getDashboards() {
  const data = await apiGet('/api/reports/dashboards');
  return Array.isArray(data?.dashboards) ? data.dashboards : [];
}

/**
 * Run every report in a category over a time window.
 * `startDate`/`endDate` are epoch SECONDS (omit for the engine's default window).
 */
export async function runCategory(category, { startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', String(Math.floor(startDate)));
  if (endDate) params.set('end_date', String(Math.floor(endDate)));
  const qs = params.toString();
  const data = await apiGet(`/api/reports/dashboards/${encodeURIComponent(category)}${qs ? `?${qs}` : ''}`);
  return Array.isArray(data?.reports) ? data.reports : [];
}
