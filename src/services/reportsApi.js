// The saved-reports surface exposed by voipappz-api. Browser calls stay relative
// so Vite/Deno can proxy them to the configured mothership without leaking its
// hostname or credentials into the client bundle.
import { apiGet } from '../lib/clients/api';

const REPORT_DATE_FIELD = 'call.created_at';

/** Normalize both the live bare array and the optional {reports: []} envelope. */
export function normalizeReports(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.reports;
  return (Array.isArray(rows) ? rows : []).filter((report) => report?.uuid);
}

/** The simple reports index used by the Appz list-and-open workflow. */
export async function listReports() {
  return normalizeReports(await apiGet('/api/reports'));
}

/** Saved report parameters are advisory; callers can fall back to their default range. */
export async function getReportParams(reportUuid) {
  const data = await apiGet(`/api/reports/${encodeURIComponent(reportUuid)}?action=params`);
  return Array.isArray(data) ? data : (Array.isArray(data?.params) ? data.params : []);
}

function dateAtBoundary(value, endOfDay) {
  if (value === null || value === undefined || value === '') return null;

  let date;
  if (value instanceof Date) {
    date = new Date(value);
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else if (typeof value === 'number') {
    date = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return null;
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Math.floor(date.getTime() / 1000);
}

/** Return saved report dates as YYYY-MM-DD values suitable for native date inputs. */
export function savedDateRange(params) {
  const dateParam = (Array.isArray(params) ? params : []).find((param) => param?.field === REPORT_DATE_FIELD);
  let values = dateParam?.value;
  if (typeof values === 'string') values = values.split(/\s+-\s+/);
  if (!Array.isArray(values) || values.length !== 2) return null;

  const dates = values.map((value) => {
    const number = Number(value);
    const date = new Date(number * 1000);
    if (!Number.isFinite(number) || Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  return dates.every(Boolean) ? { startDate: dates[0], endDate: dates[1] } : null;
}

/** Run one saved report. Dates are expanded to the full local calendar days. */
export async function runReport(reportUuid, {
  startDate,
  endDate,
  groupBy = 'day',
  limit = 100,
  offset = 0,
} = {}) {
  const params = new URLSearchParams({ action: 'run' });
  const start = dateAtBoundary(startDate, false);
  const end = dateAtBoundary(endDate, true);
  if (start !== null) params.set('start_date', String(start));
  if (end !== null) params.set('end_date', String(end));
  if (groupBy) params.set('group_by', groupBy);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return apiGet(`/api/reports/${encodeURIComponent(reportUuid)}?${params}`);
}
