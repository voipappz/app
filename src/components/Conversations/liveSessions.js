// Live rows from the environment document. The node gives the three lists as
// arrays of call UUID strings (nothing else) and `live_calls_since`, the time
// each was added in unix seconds (read defensively: it may be a hash uuid ->
// time). A number is shown only where it is known:
//  (a) the softphone's own call (call.id === uuid) -> call.remote;
//  (b) exactly ONE live call and exactly ONE agent on a call (their doc has
//      talking_to_number but no call uuid) -> that agent's name and number.
// Otherwise the row carries no number.
const LISTS = [
  ['live_calls_incoming', 'incoming'],
  ['live_calls_outgoing', 'outgoing'],
  ['live_calls_local', 'local'],
];
const BUSY = ['receiving', 'answer', 'in_a_queue_call'];

const sinceOf = (since, uuid) => {
  const v = since && typeof since === 'object' && !Array.isArray(since) ? since[uuid] : null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

export function liveSessions(envDoc, { call = null, users = [] } = {}) {
  if (!envDoc) return [];
  const rows = LISTS.flatMap(([key, direction]) =>
    (Array.isArray(envDoc[key]) ? envDoc[key] : [])
      .filter((id) => typeof id === 'string' && id)
      .map((id) => ({
        call_uuid: id, direction, live: true, contact: null, remote_number: '', agent_name: '',
        started_at: sinceOf(envDoc.live_calls_since, id), answered_at: null, ended_at: null,
      })));
  const agents = users.filter((u) => BUSY.includes(u.state) && u.talking_to_number);
  return rows.map((r) => {
    if (call && call.id === r.call_uuid && call.remote) return { ...r, remote_number: call.remote };
    if (rows.length === 1 && agents.length === 1) {
      return { ...r, remote_number: String(agents[0].talking_to_number), agent_name: agents[0].user_name || '' };
    }
    return r;
  });
}
