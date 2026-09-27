import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// The whole point of these tests is the URL. /api/agent/* has never existed on
// the API — there is no /agent mount in lib/routes.rb, so every one of these
// calls 404'd with `x-cascade: pass` and the chat silently rendered nothing.
// The real routes are lib/endpoints/vmls.rb.

// Which door is signed in. Hoisted so the mock factories can read it.
const session = vi.hoisted(() => ({ adminAccess: 'test-token', userToken: null }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ access: session.adminAccess }),
}));

vi.mock('../../context/UserAuthContext', () => ({
  useUserAuth: () => ({ token: session.userToken }),
}));

vi.mock('../../config', () => ({
  config: { apiBaseUrl: 'https://api.test' },
}));

vi.mock('../../services/api/providersApi', () => ({
  providersApi: {
    getProviders: vi.fn(async () => [
      { uuid: 'prov-1', name: 'GPT', profile: { model: 'gpt-4', service: 'openai' } },
    ]),
  },
}));

import useAIChat, { NO_LLM_MESSAGE } from './useAIChat';
import { providersApi } from '../../services/api/providersApi';

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

let fetchMock;

beforeEach(() => {
  session.adminAccess = 'test-token';
  session.userToken = null;
  localStorage.clear();
  fetchMock = vi.fn(async () => jsonResponse([]));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const urlsCalled = () => fetchMock.mock.calls.map(([url]) => url);

describe('useAIChat session endpoints', () => {
  it('lists sessions from /api/vmls/sessions, never /api/agent/*', async () => {
    const { result } = renderHook(() => useAIChat());

    // An agent must be selected before fetchSessions does anything.
    await waitFor(() => expect(result.current.agents.length).toBeGreaterThan(0));
    await act(async () => { await result.current.fetchSessions(); });

    expect(urlsCalled()).toContain('https://api.test/api/vmls/sessions');
    expect(urlsCalled().some((u) => u.includes('/api/agent/'))).toBe(false);
  });

  it('loads one session from /api/vmls/sessions/:uuid', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [] }));
    const { result } = renderHook(() => useAIChat());

    await act(async () => { await result.current.loadSession('sess-9'); });

    expect(urlsCalled()).toContain('https://api.test/api/vmls/sessions/sess-9');
  });

  it('deletes via DELETE /api/vmls/sessions/:uuid', async () => {
    const { result } = renderHook(() => useAIChat());

    await act(async () => { await result.current.deleteSession('sess-9'); });

    const [url, opts] = fetchMock.mock.calls.find(([u]) => u.includes('/sessions/sess-9'));
    expect(url).toBe('https://api.test/api/vmls/sessions/sess-9');
    expect(opts.method).toBe('DELETE');
  });

  it('streams the reply from POST /api/vmls/generate', async () => {
    const ndjson = [
      JSON.stringify({ event: 'RunStarted', session_id: 'sess-new' }),
      JSON.stringify({ event: 'RunContent', content: 'hi', session_id: 'sess-new' }),
      // Exactly what lib/endpoints/vmls.rb emits: an EMPTY content on
      // completion, because the text already arrived as RunContent.
      JSON.stringify({ event: 'RunCompleted', session_id: 'sess-new', content: '', tools: [] }),
    ].join('\n') + '\n';

    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/generate')) {
        const chunk = new TextEncoder().encode(ndjson);
        let sent = false;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: chunk })),
            }),
          },
        };
      }
      return jsonResponse([]);
    });

    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.agents.length).toBeGreaterThan(0));

    await act(async () => { await result.current.sendMessage('hello'); });

    expect(urlsCalled()).toContain('https://api.test/api/vmls/generate');
    const agent = result.current.messages.filter((m) => m.role === 'agent').pop();
    expect(agent.content).toBe('hi');
  });

  it('asks for the MCP assistant and puts its tool calls on the reply', async () => {
    const tool = { tool_call_id: 'call_1', tool_name: 'devices.registrations', tool_args: {} };
    const ndjson = [
      JSON.stringify({ event: 'RunStarted', session_id: 'sess-new' }),
      JSON.stringify({ event: 'ToolCallStarted', session_id: 'sess-new', tool }),
      JSON.stringify({
        event: 'ToolCallCompleted',
        session_id: 'sess-new',
        tool: { ...tool, content: '{"registrations": []}', tool_call_error: false },
      }),
      JSON.stringify({ event: 'RunContent', content: 'No phones are registered.', session_id: 'sess-new' }),
      JSON.stringify({
        event: 'RunCompleted',
        session_id: 'sess-new',
        content: '',
        tools: [{ ...tool, content: '{"registrations": []}', tool_call_error: false }],
      }),
    ].join('\n') + '\n';

    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/generate')) {
        const chunk = new TextEncoder().encode(ndjson);
        let sent = false;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: chunk })),
            }),
          },
        };
      }
      return jsonResponse([]);
    });

    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.agents.length).toBeGreaterThan(0));

    await act(async () => { await result.current.sendMessage('which phones are registered?'); });

    const [, opts] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/generate'));
    expect(JSON.parse(opts.body).mode).toBe('mcp');

    const agent = result.current.messages.filter((m) => m.role === 'agent').pop();
    expect(agent.content).toBe('No phones are registered.');
    // Started and completed are ONE call, merged by id — not two chips.
    expect(agent.tool_calls).toHaveLength(1);
    expect(agent.tool_calls[0]).toMatchObject({
      tool_call_id: 'call_1',
      tool_name: 'devices.registrations',
      content: '{"registrations": []}',
      tool_call_error: false,
    });
  });

  it('sends every request with the bearer token', async () => {
    const { result } = renderHook(() => useAIChat());

    await act(async () => { await result.current.loadSession('sess-9'); });

    const [, opts] = fetchMock.mock.calls.find(([u]) => u.includes('/sessions/sess-9'));
    expect(opts.headers.Authorization).toBe('Bearer test-token');
  });
});

describe('useAIChat chat history', () => {
  it('reopens the last conversation from the API', async () => {
    localStorage.setItem('ai_chat_session_id', 'sess-old');
    fetchMock.mockImplementation(async (url) => (String(url).endsWith('/sessions/sess-old')
      ? jsonResponse({ messages: [{ message: { content: 'how many calls?' }, response: { content: '42' } }] })
      : jsonResponse([])));
    const { result } = renderHook(() => useAIChat());

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].content).toBe('42');
    expect(result.current.sessionId).toBe('sess-old');
    expect(result.current.isRestoringSession).toBe(false);
  });

  it('starts fresh when the stored conversation is gone', async () => {
    localStorage.setItem('ai_chat_session_id', 'sess-gone');
    fetchMock.mockImplementation(async () => jsonResponse({ messages: [] }));
    const { result } = renderHook(() => useAIChat());

    await waitFor(() => expect(result.current.isRestoringSession).toBe(false));
    expect(result.current.sessionId).toBeNull();
    expect(localStorage.getItem('ai_chat_session_id')).toBeNull();
  });
});

describe('useAIChat has one assistant, no agent to pick', () => {
  it('selects the assistant for an account even with no LLM provider, and says one is missing', async () => {
    providersApi.getProviders.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useAIChat());

    await waitFor(() => expect(result.current.llmMissing).toBe(true));
    expect(result.current.selectedAgent).toBe('assistant');
    expect(result.current.agents).toHaveLength(1);
  });

  it('is ready when the customer has an enabled LLM provider', async () => {
    const { result } = renderHook(() => useAIChat());

    await waitFor(() => expect(result.current.isEndpointActive).toBe(true));
    expect(result.current.llmMissing).toBe(false);
    expect(result.current.selectedAgent).toBe('assistant');
  });

  it('turns the API 400 "No LLM provider configured" into a clear message', async () => {
    fetchMock.mockImplementation(async (url) => (String(url).endsWith('/generate')
      ? { ok: false, status: 400, json: async () => ({ error: 'No LLM provider configured' }) }
      : jsonResponse([])));
    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.selectedAgent).toBe('assistant'));

    await act(async () => { await result.current.sendMessage('hello'); });

    expect(result.current.llmMissing).toBe(true);
    expect(result.current.error).toBe(NO_LLM_MESSAGE);
    const [, opts] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/generate'));
    expect(JSON.parse(opts.body)).not.toHaveProperty('provider_uuid');
  });
});

describe('useAIChat in the user portal', () => {
  beforeEach(() => {
    session.adminAccess = null;
    session.userToken = 'user-token';
  });

  it('never asks the account-only providers endpoint, so it never drops into mock answers', async () => {
    const { result } = renderHook(() => useAIChat());

    await waitFor(() => expect(result.current.agents).toHaveLength(1));
    expect(providersApi.getProviders).not.toHaveBeenCalled();
    expect(result.current.canManageProviders).toBe(false);
  });

  it('asks the API with the portal token', async () => {
    const ndjson = [
      JSON.stringify({ event: 'RunStarted', session_id: 'sess-u' }),
      JSON.stringify({ event: 'RunContent', content: 'from the API', session_id: 'sess-u' }),
      JSON.stringify({ event: 'RunCompleted', session_id: 'sess-u', content: '', tools: [] }),
    ].join('\n') + '\n';

    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/generate')) {
        const chunk = new TextEncoder().encode(ndjson);
        let sent = false;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: chunk })),
            }),
          },
        };
      }
      return jsonResponse([]);
    });

    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.agents).toHaveLength(1));

    await act(async () => { await result.current.sendMessage('hello'); });

    const [, opts] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/generate'));
    expect(opts.headers.Authorization).toBe('Bearer user-token');
    expect(JSON.parse(opts.body).mode).toBe('mcp');
    const agent = result.current.messages.filter((m) => m.role === 'agent').pop();
    expect(agent.content).toBe('from the API');
  });
});
