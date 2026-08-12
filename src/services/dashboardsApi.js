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

export async function getWidgets() {
  return normalizeWidgets(await send('GET', '/dashboard/widgets'));
}

export function createWidget(widget) {
  return send('POST', '/dashboard/widgets', widget);
}

export function updateWidget(uuid, patch) {
  return send('PATCH', `/dashboard/widgets/${encodeURIComponent(uuid)}`, patch);
}

export function deleteWidget(uuid) {
  return send('DELETE', `/dashboard/widgets/${encodeURIComponent(uuid)}`);
}
