import { DENO_API_BASE } from '../lib/clients/denoApi';
import { getToken } from '../lib/auth';

/**
 * dashboardsApi — CRUD for the LOCAL dashboard widget definitions.
 *
 * The builder writes definitions to deno-api (`/dashboard/widgets`), which
 * stores them in the same DuckDB file as the consumed Crystal events. Widget
 * VALUES always come from the local snapshot projection — a definition only
 * says what to show. No mothership involvement.
 *
 * Counter metrics are the DashboardSnapshot.stats keys.
 */
export const COUNTER_METRICS = ['total', 'answered', 'failed', 'inbound', 'outbound', 'avg_duration_sec'];

const dashboardQuery = (dashboardUuid = 'default') =>
  `?${new URLSearchParams({ dashboard_uuid: dashboardUuid || 'default' })}`;

async function send(method, path, body) {
  const token = typeof getToken === 'function' ? getToken() : null;
  const response = await fetch(`${DENO_API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}`);
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// The API answers `{ widgets: [...] }`; tolerate a bare array too.
export function normalizeWidgets(payload) {
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload?.widgets) ? payload.widgets
    : [];
  return raw.filter((w) => w && typeof w === 'object' && w.uuid);
}

export function normalizeDashboards(payload) {
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload?.dashboards) ? payload.dashboards
    : [];
  return raw.filter((dashboard) => dashboard?.uuid && dashboard?.name);
}

export async function getDashboards() {
  return normalizeDashboards(await send('GET', '/dashboard/dashboards'));
}

export function createDashboard(name) {
  return send('POST', '/dashboard/dashboards', { name });
}

export function renameDashboard(uuid, name) {
  return send('PATCH', `/dashboard/dashboards/${encodeURIComponent(uuid)}`, { name });
}

export function deleteDashboard(uuid) {
  return send('DELETE', `/dashboard/dashboards/${encodeURIComponent(uuid)}`);
}

export async function getWidgets(dashboardUuid = 'default') {
  return normalizeWidgets(await send('GET', `/dashboard/widgets${dashboardQuery(dashboardUuid)}`));
}

export function createWidget(widget, dashboardUuid = 'default') {
  return send('POST', `/dashboard/widgets${dashboardQuery(dashboardUuid)}`, widget);
}

export function updateWidget(uuid, patch, dashboardUuid = 'default') {
  return send('PATCH', `/dashboard/widgets/${encodeURIComponent(uuid)}${dashboardQuery(dashboardUuid)}`, patch);
}

export function deleteWidget(uuid) {
  return send('DELETE', `/dashboard/widgets/${encodeURIComponent(uuid)}`);
}

export function buildDashboardEventsQuery({
  limit = 50, offset = 0, q = '', eventType = '', action = '', callId = '',
} = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  if (eventType.trim()) params.set('event_type', eventType.trim());
  if (action.trim()) params.set('action', action.trim());
  if (callId.trim()) params.set('call_id', callId.trim());
  return params.toString();
}

/** Authenticated, normalized DuckDB events for the builder (never raw_payload). */
export async function getDashboardEvents(filters = {}) {
  const payload = await send('GET', `/dashboard/events?${buildDashboardEventsQuery(filters)}`);
  return {
    events: Array.isArray(payload?.events) ? payload.events : [],
    total: Number(payload?.total) || 0,
    limit: Number(payload?.limit) || 50,
    offset: Number(payload?.offset) || 0,
  };
}
