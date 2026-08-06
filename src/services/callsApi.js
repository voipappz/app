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
  // `profile` is where the API actually keeps the human-facing fields. Measured
  // over 50 live MTN calls: profile present on 50, caller+callee on 49 —
  // whereas meta._contact_number/_did_number appeared on FOUR (inbound only).
  // Reading meta first left From/To blank on 46 of 50 rows.
  const p = safeRow.profile && typeof safeRow.profile === 'object' ? safeRow.profile : {};
  const dir = (m._direction || p.direction || '').toLowerCase();
  const startedAt = safeRow.created_at || null;
  const endedAt = safeRow.updated_at || null;

  // profile.duration is the call; talk_duration is answered-to-hangup. Neither
  // _duration nor _billsec existed on ANY of the 50 sampled rows, so the old
  // code always fell through to updated_at − created_at — which measures when
  // the RECORD was last written, not the call. A 2m53s call rendered as 4h58m.
  const durations = [p.duration, p.talk_duration, m._duration, m._billsec]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  let duration = durations.length ? durations[0] : 0;
  // Only fall back to the record timestamps when nothing authoritative exists,
  // and cap it: an unbounded delta is worse than admitting we do not know.
  if (!duration && startedAt && endedAt) {
    const delta = Math.round((new Date(endedAt) - new Date(startedAt)) / 1000);
    duration = delta > 0 && delta <= 4 * 3600 ? delta : 0;
  }

  return {
    id: safeRow.uuid,
    started_at: startedAt,
    direction: dir === 'incoming' ? 'inbound' : dir === 'outgoing' ? 'outbound' : dir,
    status: p.state || m._leg_a_cause || (m._ended === 'true' ? 'completed' : m._ended === 'false' ? 'in_progress' : ''),
    duration_seconds: duration,
    from_number: p.caller || m._contact_number || m._did_number || '',
    to_number: p.callee || m._did_number || m._contact_number || '',
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

function callTimestamp(call) {
  const value = Date.parse(String(call?.started_at || ''));
  return Number.isFinite(value) ? value : 0;
}

export function sortCalls(rows, orderType = 'desc') {
  const direction = orderType === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => (callTimestamp(a) - callTimestamp(b)) * direction);
}

function inRange(call, range) {
  if (!range?.start || !range?.end) return true;
  const at = callTimestamp(call);
  return at >= range.start && at <= range.end;
}

/** GET a page of calls. Returns { rows: normalized[], total }. */
export async function getCalls(opts = {}) {
  const requested = { ...opts };
  const first = await apiList(`/api/calls?${buildCallsQuery(requested)}`);
  let rows = (Array.isArray(first.rows) ? first.rows : []).map(normalizeApiCall);
  let total = first.total;

  // Some deployed voipappz-api versions return an empty page for the valid
  // Nimbus-compatible search[created_at] range. Retry only that case, without
  // changing the normal server-side contract, then apply the same range in the
  // portal so the Calls page and dashboard remain useful for those tenants.
  if (requested.range?.start && requested.range?.end && total === 0) {
    const fallback = await apiList(`/api/calls?${buildCallsQuery({
      ...requested, page: 1, perPage: Math.max(Number(requested.perPage) || 20, 500), range: undefined,
    })}`);
    const filtered = (Array.isArray(fallback.rows) ? fallback.rows : [])
      .map(normalizeApiCall)
      .filter((call) => inRange(call, requested.range));
    total = filtered.length;
    const page = Math.max(Number(requested.page) || 1, 1);
    const perPage = Math.max(Number(requested.perPage) || 20, 1);
    rows = filtered.slice((page - 1) * perPage, page * perPage);
  }

  // Nimbus asks the API to order rows. Affected deployments ignore order_type,
  // so keep the visible page deterministic while the backend is being upgraded.
  if (requested.orderBy === 'created_at' || !requested.orderBy) {
    rows = sortCalls(rows, requested.orderType);
  }
  return { rows, total };
}
