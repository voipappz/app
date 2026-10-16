// Mock data in the shapes of the Conversations contract. Used by the specs and,
// when VITE_MOCK_CONVERSATIONS=1, by the api modules instead of the network
// (a dev aid; off unless that env var is set at build/serve time).
const at = (mins) => new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - mins * 60000).toISOString();

export const CONTACT_UUID = 'ct-yael';

export const conversations = [
  { call_uuid: 'c-ring', contact: null, direction: 'incoming', remote_number: '+972525550199', user_uuid: null, started_at: at(0), answered_at: null, ended_at: null, outcome: null },
  { call_uuid: 'c-live', contact: { uuid: CONTACT_UUID, name: 'Yael Cohen', phone: '0525550144' }, direction: 'incoming', remote_number: '0525550144', user_uuid: 'u-dana', started_at: at(3), answered_at: at(3), ended_at: null, outcome: null },
  { call_uuid: 'c-missed', contact: { uuid: 'ct-noa', name: 'Noa Bar', phone: '0545550101' }, direction: 'incoming', remote_number: '0545550101', user_uuid: null, started_at: at(80), answered_at: null, ended_at: at(79), outcome: 'missed', caller: '0545550101', callee: '0035', duration: 22, talk_duration: 0, user_name: null, disposition: 'no_answer', hangup_disposition: 'caller', cause: 'NO_ANSWER', recording_url: null },
  { call_uuid: 'c-ended', contact: { uuid: 'ct-dan', name: 'Dan Levi', phone: '0505550102' }, direction: 'incoming', remote_number: '0505550102', user_uuid: 'u-dana', started_at: at(120), answered_at: at(119), ended_at: at(115), outcome: 'answered', caller: '0505550102', callee: '0035', duration: 265, talk_duration: 240, user_name: 'Dana Levi', disposition: 'answered', hangup_disposition: 'caller', cause: 'NORMAL_CLEARING', recording_url: 'https://example.invalid/recordings/c-ended.mp3' },
  { call_uuid: 'c-out', contact: { uuid: 'ct-moshe', name: 'Moshe Peretz', phone: '0535550103' }, direction: 'outgoing', remote_number: '0535550103', user_uuid: 'u-avi', started_at: at(300), answered_at: at(299), ended_at: at(290), outcome: 'answered', caller: '0036', callee: '0535550103', duration: 540, talk_duration: 515, user_name: 'Avi Mizrahi', disposition: 'answered', hangup_disposition: 'callee', cause: 'NORMAL_CLEARING', recording_url: 'https://example.invalid/recordings/c-out.mp3' },
  { call_uuid: 'c-bot', contact: null, direction: 'incoming', remote_number: '+972525550177', user_uuid: null, started_at: at(200), answered_at: at(200), ended_at: at(198), outcome: 'bot', caller: '+972525550177', callee: '0035', duration: 110, talk_duration: 105, user_name: null, leg_b_type: 'vml', disposition: 'answered', hangup_disposition: 'caller', cause: 'NORMAL_CLEARING', recording_url: null },
  { call_uuid: 'c-failed', contact: null, direction: 'outgoing', remote_number: '0555550188', user_uuid: 'u-avi', started_at: at(400), answered_at: null, ended_at: at(400), outcome: 'failed', caller: '0036', callee: '0555550188', duration: 3, talk_duration: 0, user_name: 'Avi Mizrahi', disposition: 'failed', hangup_disposition: 'system', cause: 'CALL_REJECTED', recording_url: null },
];

// The environment document as the node sends it: call uuid strings, no numbers.
export const liveRowsDoc = {
  live_calls_incoming: ['c-ring', 'c-live'],
  live_calls_outgoing: [],
  live_calls_local: [],
  live_calls_since: { 'c-ring': Math.floor(Date.parse(at(0)) / 1000), 'c-live': Math.floor(Date.parse(at(3)) / 1000) },
};

export const history = (tab) => conversations.filter((c) => (!c.outcome ? false : tab === 'all' || c.outcome === tab));

const digitsOf = (v) => String(v || '').replace(/\D/g, '');
const SORTS = { started_at: (c) => Date.parse(c.started_at), duration: (c) => c.duration || 0 };

export const threadEvents = [
  { id: 2, at: at(3), kind: 'call', text: 'Incoming on 03-555-0100 · Sales queue', user_uuid: null, data: {} },
  { id: 3, at: at(3), kind: 'call', text: 'Answered by Dana', user_uuid: 'u-dana', data: {} },
  { id: 4, at: at(2), kind: 'note', text: 'Wants the annual plan, send the price list.', user_uuid: 'u-dana', data: {} },
  { id: 5, at: at(1), kind: 'tag', text: 'Tag added: renewal', user_uuid: 'u-dana', data: {} },
];

export const contactFields = [
  { key: 'name', label: 'Name', type: 'text', options: [], required: true },
  { key: 'plan', label: 'Plan interest', type: 'select', options: ['Monthly', 'Annual'], required: false },
  { key: 'company', label: 'Company', type: 'text', options: [], required: false },
  { key: 'renewal_on', label: 'Renewal date', type: 'date', options: [], required: false },
];

export const contact = {
  uuid: CONTACT_UUID, phone: '0525550144', name: 'Yael Cohen', email: 'yael@example.com',
  fields: { plan: 'Annual', company: 'Cohen Ltd', renewal_on: '2027-01-15' },
  meta: { plan: 'gold', renewal: '' },
  previous: [
    { call_uuid: 'p-1', started_at: at(20000), direction: 'incoming', user_uuid: 'u-dana' },
    { call_uuid: 'p-2', started_at: at(30000), direction: 'outgoing', user_uuid: 'u-avi' },
  ],
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const later = (v) => Promise.resolve(clone(v));

/** Stateful stand-in for the whole conversationsApi (same function names). */
export function createMockApis() {
  const events = clone(threadEvents);
  let current = clone(contact);
  return {
    listConversations: ({ tab = 'all', q, orderBy = 'started_at', orderKind = 'desc', direction, outcome } = {}) => {
      const d = digitsOf(q).replace(/^0+/, '');
      let rows = history(tab)
        .filter((c) => !d || digitsOf(c.remote_number).includes(d))
        .filter((c) => !direction || c.direction === direction)
        .filter((c) => !outcome || c.outcome === outcome);
      const key = SORTS[orderBy] || SORTS.started_at;
      rows = [...rows].sort((a, b) => (orderKind === 'asc' ? key(a) - key(b) : key(b) - key(a)));
      return later({ data: rows, total: rows.length });
    },
    getConversation: (id) => later({ data: conversations.find((c) => c.call_uuid === id) || null }),
    getEvents: () => later({ data: events }),
    addNote: (_id, text) => {
      const ev = { id: events.length + 1, at: new Date().toISOString(), kind: 'note', text, user_uuid: 'u-dana', data: {} };
      events.push(ev);
      return later({ data: ev });
    },
    lookupContact: (phone) => later({ data: digitsOf(phone).endsWith('525550144') ? { uuid: CONTACT_UUID } : null }),
    getContact: () => later({ data: current }),
    createContact: ({ phone, name }) => later({ data: { uuid: 'ct-new', phone, name: name || '', email: '', fields: {}, meta: {}, previous: [] } }),
    updateContact: (_uuid, { field, value, meta, removeMeta } = {}) => {
      current = clone(current);
      if (field === 'name' || field === 'email') current[field] = value;
      else if (field) current.fields[field] = value;
      if (meta) Object.assign(current.meta, meta);
      if (removeMeta) delete current.meta[removeMeta];
      return later({ data: current });
    },
    listFields: () => later({ data: contactFields }),
    createField: (f) => later({ data: f }),
  };
}
