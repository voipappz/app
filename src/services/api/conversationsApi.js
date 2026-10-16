import { apiService } from '../apiService';
import { createMockApis } from '../../components/Conversations/fixtures';

// VITE_MOCK_CONVERSATIONS=1 serves fixtures instead of the network (dev aid,
// off unless that env var is set). See components/Conversations/fixtures.js.
export const MOCK_CONVERSATIONS = import.meta.env?.VITE_MOCK_CONVERSATIONS === '1';
const mocks = MOCK_CONVERSATIONS ? createMockApis() : null;
export const mockApis = mocks;

/**
 * Conversations API. History and threads only: live rows come from the cable
 * (useLiveEntities), never from here. Bodies are form-url-encoded.
 */
const real = {
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

export const conversationsApi = mocks ? mocks.conversationsApi : real;

export default conversationsApi;
