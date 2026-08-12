import { apiGet } from '../lib/clients/api';

export function normalizeApiEventPage(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const total = Number(payload?.total_records);
  return {
    rows,
    total: Number.isFinite(total) && total >= 0 ? total : rows.length,
  };
}

/** Read tenant-scoped EventCdr rows from voipappz-api without importing them. */
export async function getApiCdrEvents({ page = 1, perPage = 25 } = {}) {
  const params = new URLSearchParams({
    event_type: 'EventCdr',
    page: String(page),
    per_page: String(perPage),
    order_by: 'created_at',
    order_type: 'desc',
  });
  return normalizeApiEventPage(await apiGet(`/api/events?${params}`));
}
