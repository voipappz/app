import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

import { apiService } from '../apiService';
import { conversationsApi } from './conversationsApi';
import { contactsApi } from './contactsApi';

beforeEach(() => vi.clearAllMocks());

describe('conversationsApi', () => {
  it('lists history by tab', async () => {
    await conversationsApi.list({ tab: 'missed', page: 2, perPage: 20 });
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations?tab=missed&page=2&per_page=20');
  });

  it('reads the thread of a call', async () => {
    await conversationsApi.events('c 1');
    expect(apiService.get.mock.calls[0][0]).toBe('/api/conversations/c%201/events');
  });

  it('posts a note form-encoded', async () => {
    await conversationsApi.addNote('c1', 'hello there');
    const [url, body] = apiService.post.mock.calls[0];
    expect(url).toBe('/api/conversations/c1/notes');
    expect(body.toString()).toBe('text=hello+there');
  });
});

describe('contactsApi', () => {
  it('looks a contact up by phone', async () => {
    await contactsApi.lookup('+972525550144');
    expect(apiService.get.mock.calls[0][0]).toBe('/api/contacts/lookup?phone=%2B972525550144');
  });

  it('patches a field with PATCH and fields[key]', async () => {
    await contactsApi.update('u1', { field: 'email', value: 'a@b.c' });
    const [url, body] = apiService.patch.mock.calls[0];
    expect(url).toBe('/api/contacts/u1');
    expect(decodeURIComponent(body.toString())).toBe('fields[email]=a@b.c');
  });

  it('adds and removes tags', async () => {
    await contactsApi.update('u1', { meta: { plan: 'gold' } });
    await contactsApi.update('u1', { removeMeta: 'plan' });
    expect(decodeURIComponent(apiService.patch.mock.calls[0][1].toString())).toBe('meta[plan]=gold');
    expect(decodeURIComponent(apiService.patch.mock.calls[1][1].toString())).toBe('remove_meta[]=plan');
  });
});
