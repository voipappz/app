import { apiService } from '../apiService';

/**
 * Conversations API. History and threads only: live rows come from the cable
 * (useLiveEntities), never from here. Bodies are form-url-encoded.
 */
export const conversationsApi = {
  /** tab: 'all' | 'missed'. Returns { data: [...], total }. */
  list: ({ tab = 'all', page = 1, perPage = 50 } = {}) => {
    const q = new URLSearchParams({ tab, page: String(page), per_page: String(perPage) });
    return apiService.get(`/api/conversations?${q}`, {}, 'fetching conversations', false);
  },

  /** The thread for the call's contact, newest last. Returns { data: [...] }. */
  events: (callUuid) =>
    apiService.get(`/api/conversations/${encodeURIComponent(callUuid)}/events`, {}, 'fetching conversation events', false),

  addNote: (callUuid, text) =>
    apiService.post(
      `/api/conversations/${encodeURIComponent(callUuid)}/notes`,
      new URLSearchParams({ text }),
      {},
      'adding note',
      false
    ),
};

export default conversationsApi;
