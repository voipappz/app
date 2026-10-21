// The Calls table's columns for a portal USER session. The account console
// reads its columns from GET /api/calls?action=columns, which the API serves an
// ACCOUNT only; for a user token it answers with the list's :portal_list shape,
// where the call's facts are nested under `profile` — these are those fields,
// in the same column format, so the shared renderers draw them as-is.
export const USER_CALL_COLUMNS = [
  { name: 'Created At', type: 'date', field: 'call.created_at', prop: 'created_at', sort_by: 'created_at', selected: true },
  { name: 'Direction', type: 'sub_object', field: 'call.direction', prop: 'profile', sub_prop: 'direction', selected: true },
  { name: 'Caller', type: 'sub_object', field: 'call.caller', prop: 'profile', sub_prop: 'caller', selected: true },
  { name: 'Callee', type: 'sub_object', field: 'call.callee', prop: 'profile', sub_prop: 'callee', selected: true },
  { name: 'Talk Duration', type: 'sub_object', field: 'call.talk_duration', prop: 'profile', sub_prop: 'talk_duration', selected: true },
  { name: 'Cause', type: 'sub_object', field: 'call.cause', prop: 'profile', sub_prop: 'cause', selected: true },
];
