// Agent status — the presence an agent publishes to the platform (Available,
// On Break, …). Ported from the voipappz-api contract itself, not guessed:
//
//   PATCH /api/users/:uuid?action=status&type=<key>&name=<label>
//     lib/endpoints/users.rb, `when 'status'` — it reads params['status'] or
//     params['type'], rejects anything outside Agent::STATUSES_MAPPINGS.keys
//     with a 406, and defaults `name` to the humanised key.
//   GET /statuses?type=on_break
//     lib/endpoints/statuses.rb — the customer's own break reasons, so "On
//     Break" can say WHY (Lunch, Training, …).
//
// Both go through lib/clients/api, which owns the bearer token and the
// 401 → drop-session path.
import { apiGet, apiList, apiSend } from '../lib/clients/api';

// The platform owns this list, so it is FETCHED, not restated here:
//   GET /statuses/agent_statuses  →  Agent::STATUSES_MAPPINGS
//   {"logged_out":"Logged Out","available":"Available",
//    "available_on_demand":"Available (On Demand)","on_break":"On Break"}
// Keys are the wire values the PATCH accepts (anything else is a 406) and the
// values are the labels to show. A copy in the frontend would be a second
// source of truth that silently rots the day the platform adds a status.
export async function listAgentStatuses() {
  const map = await apiGet('/api/statuses/agent_statuses');
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map)
    .filter(([type, label]) => typeof type === 'string' && typeof label === 'string')
    .map(([type, label]) => ({ type, label }));
}

// Used only to keep a bad value from costing a round-trip; the authoritative
// list is the one above. Kept in sync with Agent::STATUSES_MAPPINGS.keys.
const KNOWN = new Set(['available', 'available_on_demand', 'on_break', 'logged_out']);

/**
 * Publish a new agent status. `name` is the human label — for `on_break` it is
 * the reason ("Lunch"); the server humanises the key when it is omitted.
 * Resolves to the updated user the server returns.
 */
export async function setAgentStatus(userUuid, type, name) {
  if (!userUuid) throw new Error('setAgentStatus: user uuid is required');
  // Fail here rather than spend a round-trip earning a 406.
  if (!KNOWN.has(type)) throw new Error(`setAgentStatus: unknown status "${type}"`);

  const params = new URLSearchParams({ action: 'status', type });
  if (name) params.set('name', name);
  return apiSend('PATCH', `/api/users/${encodeURIComponent(userUuid)}?${params}`);
}

/**
 * The tenant's break reasons. Per-customer, so it is fetched rather than
 * hard-coded; an empty list simply means "On Break" carries no reason.
 */
export async function listBreakReasons() {
  const { rows } = await apiList('/api/statuses?type=on_break');
  return rows
    .map((row) => ({ name: row?.name, uuid: row?.uuid }))
    .filter((row) => typeof row.name === 'string' && row.name.length > 0);
}
