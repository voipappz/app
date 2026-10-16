import { apiService } from '../apiService';
import { createMockApis } from '../../components/Conversations/fixtures';

// Everything the Conversations screen reads or writes lives under
// /api/conversations (calls, events, notes, contacts, fields). Bodies are
// form-url-encoded. Live rows never come from here: they come from the cable.
//
// VITE_MOCK_CONVERSATIONS=1 serves the fixtures instead of the network (a dev
// aid, off unless that env var is set). See components/Conversations/fixtures.js.
export const MOCK_CONVERSATIONS = import.meta.env?.VITE_MOCK_CONVERSATIONS === '1';

const BASE = '/api/conversations';
const enc = encodeURIComponent;

const real = {
  /** { tab: 'all'|'missed', q, orderBy, orderKind, direction, outcome, scope, page, perPage } -> { data, total } */
  listConversations: ({ tab = 'all', q, orderBy, orderKind, direction, outcome, scope, page = 1, perPage = 50 } = {}) => {
    const p = new URLSearchParams({ tab, page: String(page), per_page: String(perPage) });
    if (q) p.set('q', q);
    if (orderBy) p.set('order_by', orderBy);
    if (orderKind) p.set('order_kind', orderKind);
    if (direction) p.set('direction', direction);
    if (outcome) p.set('outcome', outcome);
    if (scope) p.set('scope', scope);
    return apiService.get(`${BASE}?${p}`, {}, 'fetching conversations', false);
  },

  getConversation: (callUuid) => apiService.get(`${BASE}/${enc(callUuid)}`, {}, 'fetching conversation', false),

  /** The thread for the call's contact, newest last. -> { data: [...] } */
  getEvents: (callUuid) => apiService.get(`${BASE}/${enc(callUuid)}/events`, {}, 'fetching conversation events', false),

  addNote: (callUuid, text) =>
    apiService.post(`${BASE}/${enc(callUuid)}/notes`, new URLSearchParams({ text }), {}, 'adding note', false),

  /** -> { data: contact | null } */
  lookupContact: (phone) =>
    apiService.get(`${BASE}/contacts/lookup?${new URLSearchParams({ phone })}`, {}, 'looking up contact', false),

  getContact: (uuid) => apiService.get(`${BASE}/contacts/${enc(uuid)}`, {}, 'fetching contact', false),

  createContact: ({ phone, name }) => {
    const body = new URLSearchParams({ phone });
    if (name) body.set('name', name);
    return apiService.post(`${BASE}/contacts`, body, {}, 'creating contact', false);
  },

  /** One change per call: { field, value } | { meta: {k: v} } | { removeMeta: 'k' }. */
  updateContact: (uuid, { field, value, meta, removeMeta } = {}) => {
    const body = new URLSearchParams();
    if (field) body.append(`fields[${field}]`, value ?? '');
    if (meta) Object.entries(meta).forEach(([k, v]) => body.append(`meta[${k}]`, v ?? ''));
    if (removeMeta) body.append('remove_meta[]', removeMeta);
    return apiService.patch(`${BASE}/contacts/${enc(uuid)}`, body, {}, 'updating contact', false);
  },

  /** -> { data: [{ key, label, type, options, required }] } */
  listFields: () => apiService.get(`${BASE}/fields`, {}, 'fetching contact fields', false),

  createField: ({ key, label, type, options = [], required = false }) => {
    const body = new URLSearchParams({ key, label, type, required: String(required) });
    options.forEach((o) => body.append('options[]', o));
    return apiService.post(`${BASE}/fields`, body, {}, 'creating contact field', false);
  },
};

export const conversationsApi = MOCK_CONVERSATIONS ? createMockApis() : real;

// Named functions for callers (resolved at call time, so specs may mock the module).
export const {
  listConversations, getConversation, getEvents, addNote,
  lookupContact, getContact, createContact, updateContact, listFields, createField,
} = conversationsApi;

export default conversationsApi;
