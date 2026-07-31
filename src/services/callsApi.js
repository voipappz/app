// Calls API module — server-side list against voipappz-api /api/calls.
// Mirrors nimbus-admin's services/api/callsApi.js + buildSearchQueryParams, using
// this app's apiList (Basic + X-VA-Auth, X-Total pagination, 401→logout).
import { apiList } from '../lib/clients/api';

// Map a voipappz-api /api/calls row → the flat shape the Calls UI expects. The
// API nests most fields under `meta`; duration is derived from created→updated
// when the API doesn't return a numeric seconds field.
export function normalizeApiCall(row) {
  // The API occasionally omits `meta` (or returns it as null) for partial or
  // newly-created calls. Treat those rows as valid rather than crashing the
  // whole Calls page while normalizing them.
  const safeRow = row && typeof row === 'object' ? row : {};
  const m = safeRow.meta && typeof safeRow.meta === 'object' ? safeRow.meta : {};
  const dir = (m._direction || '').toLowerCase();
  const startedAt = safeRow.created_at || null;
  const endedAt = safeRow.updated_at || null;
  let duration = Number(m._duration ?? m._billsec ?? 0);
  if ((!duration || Number.isNaN(duration)) && startedAt && endedAt) {
    duration = Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 1000));
  }
  return {
    id: safeRow.uuid,
    started_at: startedAt,
    direction: dir === 'incoming' ? 'inbound' : dir === 'outgoing' ? 'outbound' : dir,
    status: m._leg_a_cause || (m._ended === 'true' ? 'completed' : m._ended === 'false' ? 'in_progress' : ''),
    duration_seconds: duration,
    from_number: m._contact_number || m._did_number || '',
    to_number: m._did_number || m._contact_number || '',
    recording_url: safeRow.recording?.url || null,
    // Legs/events aren't in the list row — default so the table doesn't render '—' wrongly.
    leg_count: [safeRow.leg_a_type, safeRow.leg_b_type].filter(Boolean).length || null,
    event_count: null,
    transcription_status: null,
    raw: safeRow,
  };
}

// Build the /api/calls query string. Single builder (port of nimbus
// buildSearchQueryParams) so list/aggregate/export stay consistent:
//   - paging/sort → page, per_page, order_by, order_type
//   - date range  → search[created_at]=<startEpoch> - <endEpoch>  (space-dash-space)
//   - filters     → search[<field>]=v  (or search[<field>][<op>]=v when op set);
//                   array values → repeated search[<field>][]=v
export function buildCallsQuery({ page = 1, perPage = 20, orderBy = 'created_at', orderType = 'desc', range, search } = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('order_by', orderBy);
  params.set('order_type', orderType);

  if (range?.start && range?.end) {
    const s = Math.floor(range.start / 1000);
    const e = Math.floor(range.end / 1000);
    params.set('search[created_at]', `${s} - ${e}`);
  }

  for (const [field, entry] of Object.entries(search || {})) {
    if (entry == null || entry === '') continue;
    const { value, op } = (typeof entry === 'object' && !Array.isArray(entry)) ? entry : { value: entry, op: null };
    if (value == null || value === '') continue;
    const key = op ? `search[${field}][${op}]` : `search[${field}]`;
    if (Array.isArray(value)) {
      for (const v of value) if (v != null && v !== '') params.append(`${key}[]`, String(v));
    } else {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

/** GET a page of calls. Returns { rows: normalized[], total }. */
export async function getCalls(opts = {}) {
  const { rows, total } = await apiList(`/api/calls?${buildCallsQuery(opts)}`);
  return { rows: (Array.isArray(rows) ? rows : []).map(normalizeApiCall), total };
}
