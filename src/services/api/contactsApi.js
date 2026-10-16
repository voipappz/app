import { apiService } from '../apiService';
import { mockApis } from './conversationsApi';

/** Contacts and their site-defined fields. Bodies are form-url-encoded. */
const real = {
  /** Returns { data: contact | null }. */
  lookup: (phone) =>
    apiService.get(`/api/contacts/lookup?${new URLSearchParams({ phone })}`, {}, 'looking up contact', false),

  get: (uuid) => apiService.get(`/api/contacts/${encodeURIComponent(uuid)}`, {}, 'fetching contact', false),

  create: ({ phone, name }) => {
    const body = new URLSearchParams({ phone });
    if (name) body.set('name', name);
    return apiService.post('/api/contacts', body, {}, 'creating contact', false);
  },

  /**
   * One change per call: { field, value } | { meta: {k: v} } | { removeMeta: 'k' }.
   * Built-in name/email and defined fields go as fields[key]=value.
   */
  update: (uuid, { field, value, meta, removeMeta } = {}) => {
    const body = new URLSearchParams();
    if (field) body.append(`fields[${field}]`, value ?? '');
    if (meta) Object.entries(meta).forEach(([k, v]) => body.append(`meta[${k}]`, v ?? ''));
    if (removeMeta) body.append('remove_meta[]', removeMeta);
    return apiService.patch(`/api/contacts/${encodeURIComponent(uuid)}`, body, {}, 'updating contact', false);
  },

  /** Returns { data: [{ key, label, type, options, required }] }. */
  fields: () => apiService.get('/api/contact_fields', {}, 'fetching contact fields', false),
};

// Same switch as conversationsApi (VITE_MOCK_CONVERSATIONS=1): shared mock state.
export const contactsApi = mockApis ? mockApis.contactsApi : real;

export default contactsApi;
