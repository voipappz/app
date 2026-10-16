// Mock data in the shapes of the Conversations contract. Used by the specs and,
// when VITE_MOCK_CONVERSATIONS=1, by the api modules instead of the network
// (a dev aid; off unless that env var is set at build/serve time).
const at = (mins) => new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - mins * 60000).toISOString();

export const CONTACT_UUID = 'ct-yael';

export const conversations = [
  { call_uuid: 'c-ring', contact: null, direction: 'incoming', remote_number: '0525550199', user_uuid: null, started_at: at(0), answered_at: null, ended_at: null, outcome: null },
  { call_uuid: 'c-live', contact: { uuid: CONTACT_UUID, name: 'Yael Cohen', phone: '0525550144' }, direction: 'incoming', remote_number: '0525550144', user_uuid: 'u-dana', started_at: at(3), answered_at: at(3), ended_at: null, outcome: null },
  { call_uuid: 'c-missed', contact: { uuid: 'ct-noa', name: 'Noa Bar', phone: '0545550101' }, direction: 'incoming', remote_number: '0545550101', user_uuid: null, started_at: at(80), answered_at: null, ended_at: at(79), outcome: 'missed' },
  { call_uuid: 'c-ended', contact: { uuid: 'ct-dan', name: 'Dan Levi', phone: '0505550102' }, direction: 'incoming', remote_number: '0505550102', user_uuid: 'u-dana', started_at: at(120), answered_at: at(119), ended_at: at(115), outcome: 'answered' },
  { call_uuid: 'c-out', contact: { uuid: 'ct-moshe', name: 'Moshe Peretz', phone: '0535550103' }, direction: 'outgoing', remote_number: '0535550103', user_uuid: 'u-avi', started_at: at(300), answered_at: at(299), ended_at: at(290), outcome: 'answered' },
  { call_uuid: 'c-sms', contact: { uuid: 'ct-rina', name: 'Rina Katz', phone: '0585550104' }, direction: 'incoming', remote_number: '0585550104', user_uuid: null, started_at: at(1500), answered_at: null, ended_at: at(1500), outcome: 'sms' },
];

export const liveRowsDoc = {
  live_calls_incoming: [
    { call_uuid: 'c-ring', from_number: '0525550199', started_at: at(0) },
    { call_uuid: 'c-live', from_number: '0525550144', started_at: at(3), answered_at: at(3) },
  ],
  live_calls_outgoing: [],
  live_calls_local: [],
};

export const history = (tab) => conversations.filter((c) => !c.outcome ? false : tab === 'all' || c.outcome === tab);

export const threadEvents = [
  { id: 1, at: at(1440), kind: 'sms', text: 'Hi, is the annual plan still on offer?', user_uuid: null, data: {} },
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

/** Stateful stand-ins for conversationsApi / contactsApi. */
export function createMockApis() {
  const events = clone(threadEvents);
  let current = clone(contact);
  const conversationsApi = {
    list: ({ tab = 'all' } = {}) => later({ data: history(tab), total: history(tab).length }),
    events: () => later({ data: events }),
    addNote: (_id, text) => {
      const ev = { id: events.length + 1, at: new Date().toISOString(), kind: 'note', text, user_uuid: 'u-dana', data: {} };
      events.push(ev);
      return later({ data: ev });
    },
  };
  const contactsApi = {
    lookup: (phone) => later({ data: String(phone).replace(/\D/g, '') === '0525550144' ? { uuid: CONTACT_UUID } : null }),
    get: () => later({ data: current }),
    create: ({ phone, name }) => later({ data: { uuid: 'ct-new', phone, name: name || '', email: '', fields: {}, meta: {}, previous: [] } }),
    update: (_uuid, { field, value, meta, removeMeta } = {}) => {
      current = clone(current);
      if (field === 'name' || field === 'email') current[field] = value;
      else if (field) current.fields[field] = value;
      if (meta) Object.assign(current.meta, meta);
      if (removeMeta) delete current.meta[removeMeta];
      return later({ data: current });
    },
    fields: () => later({ data: contactFields }),
  };
  return { conversationsApi, contactsApi };
}
