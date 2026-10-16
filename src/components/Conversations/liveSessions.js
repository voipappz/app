// Live rows from the environment document's live-call arrays (cable only).
const LISTS = [
  ['live_calls_incoming', 'incoming'],
  ['live_calls_outgoing', 'outgoing'],
  ['live_calls_local', 'local'],
];

const pick = (c, keys) => keys.map((k) => c?.[k]).find((v) => v !== undefined && v !== null && v !== '');

export function liveSessions(envDoc) {
  if (!envDoc) return [];
  return LISTS.flatMap(([key, direction]) =>
    (Array.isArray(envDoc[key]) ? envDoc[key] : []).map((c) => {
      const call = typeof c === 'object' && c ? c : { call_uuid: c };
      const outgoing = direction === 'outgoing';
      return {
        call_uuid: pick(call, ['call_uuid', 'uuid', 'id']),
        direction,
        live: true,
        contact: null,
        remote_number: pick(call, outgoing ? ['to_number', 'to', 'remote_number'] : ['from_number', 'from', 'caller', 'remote_number']) || '',
        started_at: pick(call, ['started_at', 'start_time', 'created_at']) || null,
        answered_at: pick(call, ['answered_at']) || null,
        ended_at: null,
      };
    })
  ).filter((s) => s.call_uuid);
}
