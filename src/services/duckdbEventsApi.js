import { getToken } from '../lib/auth';
import { DENO_API_BASE } from '../lib/clients/denoApi';

export function buildDuckdbEventsQuery({
  page = 0,
  perPage = 25,
  q = '',
  eventType = '',
  action = '',
  callId = '',
} = {}) {
  const params = new URLSearchParams({
    limit: String(perPage),
    offset: String(Math.max(0, page) * perPage),
  });
  if (q.trim()) params.set('q', q.trim());
  if (eventType.trim()) params.set('event_type', eventType.trim());
  if (action.trim()) params.set('action', action.trim());
  if (callId.trim()) params.set('call_id', callId.trim());
  return params.toString();
}

export function normalizeDuckdbEventPage(payload) {
  const rows = Array.isArray(payload?.events) ? payload.events : [];
  const total = Number(payload?.total);
  return {
    rows,
    total: Number.isFinite(total) && total >= 0 ? total : rows.length,
    disabled: false,
  };
}

/** Read only the raw rows persisted in this app's local DuckDB. */
export async function getDuckdbEvents(options = {}) {
  const token = getToken();
  const response = await fetch(`${DENO_API_BASE}/events?${buildDuckdbEventsQuery(options)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 404) return { rows: [], total: 0, disabled: true };
  if (!response.ok) throw new Error(`/events → ${response.status}`);
  return normalizeDuckdbEventPage(await response.json());
}
