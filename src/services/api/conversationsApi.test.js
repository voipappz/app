import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

import { apiService } from '../apiService';
import * as api from './conversationsApi';

beforeEach(() => vi.clearAllMocks());
const form = (b) => decodeURIComponent(b.toString().replace(/\+/g, ' '));

describe('conversationsApi', () => {
  it('lists history with search, sort and filters', async () => {
    await api.listConversations({ tab: 'missed', q: '5550144', orderBy: 'started_at', orderKind: 'asc', direction: 'incoming', outcome: 'bot', scope: 'environment', page: 2, perPage: 20 });
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations?tab=missed&page=2&per_page=20&q=5550144&order_by=started_at&order_kind=asc&direction=incoming&outcome=bot&scope=environment');
  });

  it('omits unset params', async () => {
    await api.listConversations({});
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations?tab=all&page=1&per_page=50');
  });

  it('reads a conversation and its thread', async () => {
    await api.getConversation('c 1');
    await api.getEvents('c 1');
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations/c%201');
    expect(apiService.get.mock.calls[1][0]).toBe('/api/conversations/c%201/events');
  });

  it('posts a note form-encoded', async () => {
    await api.addNote('c1', 'hello there');
    const [url, body] = apiService.post.mock.calls[0];
    expect(url).toBe('/api/conversations/c1/notes');
    expect(body.toString()).toBe('text=hello+there');
  });

  it('looks a contact up and reads it under /conversations/contacts', async () => {
    await api.lookupContact('+972525550144');
    await api.getContact('u1');
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations/contacts/lookup?phone=%2B972525550144');
    expect(apiService.get.mock.calls[1][0]).toBe('/api/conversations/contacts/u1');
  });

  it('patches a field, adds and removes tags', async () => {
    await api.updateContact('u1', { field: 'email', value: 'a@b.c' });
    await api.updateContact('u1', { meta: { plan: 'gold' } });
    await api.updateContact('u1', { removeMeta: 'plan' });
    expect(apiService.patch.mock.calls[0][0]).toBe('/api/conversations/contacts/u1');
    expect(form(apiService.patch.mock.calls[0][1])).toBe('fields[email]=a@b.c');
    expect(form(apiService.patch.mock.calls[1][1])).toBe('meta[plan]=gold');
    expect(form(apiService.patch.mock.calls[2][1])).toBe('remove_meta[]=plan');
  });

  it('lists and creates fields', async () => {
    await api.listFields();
    await api.createField({ key: 'plan', label: 'Plan', type: 'select', options: ['A', 'B'], required: true });
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations/fields');
    expect(apiService.post.mock.calls[0][0]).toBe('/api/conversations/fields');
    expect(form(apiService.post.mock.calls[0][1])).toBe('key=plan&label=Plan&type=select&required=true&options[]=A&options[]=B');
  });
});
