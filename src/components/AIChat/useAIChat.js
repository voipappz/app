import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { config } from '../../config';
import { providersApi } from '../../services/api/providersApi';
import { getMockSessions, generateMockStreamResponse } from './aiMockService';

/**
 * Backend endpoints (lib/endpoints/vmls.rb on the API):
 *   GET    /api/vmls/sessions        — [{ session_id, session_name, created_at }]
 *   GET    /api/vmls/sessions/:uuid  — { messages: [{ message, response }] }
 *   DELETE /api/vmls/sessions/:uuid  — { deleted: true }
 *   POST   /api/vmls/generate        — NDJSON stream of the RunEvent types below
 *
 * These were written against /api/agent/*, which has never existed on the API —
 * no /agent mount in lib/routes.rb, so every call 404'd with `x-cascade: pass`
 * and the chat silently showed no sessions. The shapes already matched vmls
 * exactly (down to the RunStarted/RunContent/RunCompleted/RunError names); only
 * the prefix was wrong.
 *
 * Sessions are indexed per CUSTOMER (`vml-index:<customer_uuid>`), not per
 * provider, so the old `?provider_id=` was never read server-side.
 */

/**
 * Run event types from agent-ui
 */
const RunEvent = {
  RunStarted: 'RunStarted',
  RunContent: 'RunContent',
  // Discrete full reply (Stealth bot emits one per `say()` — each is its own bubble)
  RunResponse: 'RunResponse',
  RunCompleted: 'RunCompleted',
  RunError: 'RunError',
  ToolCallStarted: 'ToolCallStarted',
  ToolCallCompleted: 'ToolCallCompleted',
  ReasoningStarted: 'ReasoningStarted',
  ReasoningStep: 'ReasoningStep',
  ReasoningCompleted: 'ReasoningCompleted',
};

/**
 * Parse streaming buffer to extract complete JSON objects
 */
function parseBuffer(buffer, onChunk) {
  let currentIndex = 0;
  let jsonStartIndex = buffer.indexOf('{', currentIndex);

  while (jsonStartIndex !== -1 && jsonStartIndex < buffer.length) {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEndIndex = -1;

    for (let i = jsonStartIndex; i < buffer.length; i++) {
      const char = buffer[i];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === '\\') {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEndIndex = i;
            break;
          }
        }
      }
    }

    if (jsonEndIndex !== -1) {
      const jsonString = buffer.slice(jsonStartIndex, jsonEndIndex + 1);

      try {
        const parsed = JSON.parse(jsonString);

        if (parsed.event && parsed.data && typeof parsed.data === 'string') {
          try {
            const dataObj = JSON.parse(parsed.data);
            onChunk({ event: parsed.event, ...dataObj });
          } catch {
            onChunk(parsed);
          }
        } else {
          onChunk(parsed);
        }
      } catch {
        // Invalid JSON, skip
      }

      currentIndex = jsonEndIndex + 1;
      buffer = buffer.slice(currentIndex).trim();
      currentIndex = 0;
      jsonStartIndex = buffer.indexOf('{', currentIndex);
    } else {
      break;
    }
  }

  return buffer;
}

/**
 * Custom hook for AI Chat functionality with agents and sessions
 */
const ASSISTANT = { id: 'assistant', agent_id: 'assistant', name: 'VoipAppz assistant' };
export const NO_LLM_MESSAGE = 'No LLM provider is configured for this customer. The assistant needs one (an Anthropic or OpenAI key under Providers, type LLM) to understand questions.';

export const useAIChat = () => {
  // Either door: the admin console's token or the portal user's. A browser
  // holds only one at a time (sessionIsolation.js), and the API scopes the
  // assistant's tools to whichever it is.
  const { access: adminAccess } = useAuth();
  const { token: userToken } = useUserAuth();
  const access = adminAccess || userToken || null;
  // /api/providers is an account endpoint; a portal token gets 401 there.
  const canManageProviders = Boolean(adminAccess);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  // Session management
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('ai_chat_session_id') || null;
  });
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Agent management
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  // The customer has no enabled LLM provider to run the assistant.
  const [llmMissing, setLlmMissing] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // Tool calls and reasoning
  const [toolCalls, setToolCalls] = useState([]);
  const [reasoningSteps, setReasoningSteps] = useState([]);

  // Endpoint status
  const [isEndpointActive, setIsEndpointActive] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);

  const abortControllerRef = useRef(null);

  // Generate unique ID
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // There is nothing to choose: /api/vmls/generate ignores provider_uuid and
  // runs the customer's first enabled LLM provider. So every session talks to
  // one fixed assistant. An account can still see whether the customer has an
  // LLM provider at all, so the chat says so up front instead of failing with
  // "No LLM provider configured" on the first message.
  const fetchAgents = useCallback(async () => {
    if (!access) return;

    setAgents([ASSISTANT]);
    setSelectedAgent(ASSISTANT.id);
    setIsMockMode(false);
    setIsEndpointActive(true);
    setLlmMissing(false);

    // /api/providers is an account endpoint; a portal token gets 401 there.
    if (!canManageProviders) return;

    setIsLoadingAgents(true);
    try {
      const data = await providersApi.getProviders({ 'search[type]': 'llm' });
      const list = Array.isArray(data) ? data : (data?.data || []);
      const missing = !list.some((p) => p.enabled !== false);
      setLlmMissing(missing);
      setIsEndpointActive(!missing);
    } catch (err) {
      // Unknown: let the first message find out from the API itself.
      console.error('Failed to fetch LLM providers:', err);
    } finally {
      setIsLoadingAgents(false);
    }
  }, [access, canManageProviders]);

  // Fetch chat sessions
  const fetchSessions = useCallback(async () => {
    if (!selectedAgent) return;

    if (isMockMode) {
      setSessions(getMockSessions());
      return;
    }

    if (!access) return;

    setIsLoadingSessions(true);
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/vmls/sessions`, {
        method: 'GET',
        headers: {
          'Authorization': access ? `Bearer ${access}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const sessionList = Array.isArray(data) ? data : (data.sessions || data.data || []);
        setSessions(sessionList);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [access, selectedAgent, isMockMode]);

  // Load session messages
  const loadSession = useCallback(async (sessionIdToLoad) => {
    if (!access || !sessionIdToLoad) return;

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/vmls/sessions/${sessionIdToLoad}`, {
        method: 'GET',
        headers: {
          'Authorization': access ? `Bearer ${access}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const sessionMessages = data.messages || data.runs || [];

        // Convert to our message format
        const formattedMessages = sessionMessages.flatMap(entry => {
          const msgs = [];
          if (entry.message) {
            msgs.push({
              id: generateId(),
              role: 'user',
              content: entry.message.content || entry.message,
              created_at: entry.message.created_at || Date.now() / 1000
            });
          }
          if (entry.response) {
            msgs.push({
              id: generateId(),
              role: 'agent',
              content: entry.response.content || entry.response,
              created_at: entry.response.created_at || Date.now() / 1000,
              tool_calls: entry.response.tools || [],
              extra_data: entry.response.extra_data
            });
          }
          return msgs;
        });

        setMessages(formattedMessages);
        setSessionId(sessionIdToLoad);
        localStorage.setItem('ai_chat_session_id', sessionIdToLoad);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, [access]);

  // Delete session
  const deleteSession = useCallback(async (sessionIdToDelete) => {
    if (!access || !sessionIdToDelete) return;

    try {
      await fetch(`${config.apiBaseUrl}/api/vmls/sessions/${sessionIdToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': access ? `Bearer ${access}` : ''
        }
      });

      // Remove from local list
      setSessions(prev => prev.filter(s => s.session_id !== sessionIdToDelete));

      // Clear current session if deleted
      if (sessionId === sessionIdToDelete) {
        setSessionId(null);
        setMessages([]);
        localStorage.removeItem('ai_chat_session_id');
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [access, sessionId]);

  // Initialize - fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Fetch sessions when agent changes
  useEffect(() => {
    if (selectedAgent) {
      fetchSessions();
    }
  }, [selectedAgent, fetchSessions]);

  // Handle agent selection
  const handleAgentSelect = useCallback((agentId) => {
    setSelectedAgent(agentId);
    localStorage.setItem('ai_chat_selected_agent', agentId);
    // Clear current session when switching agents
    setSessionId(null);
    setMessages([]);
    localStorage.removeItem('ai_chat_session_id');
  }, []);

  // Add a message
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      created_at: Math.floor(Date.now() / 1000),
      ...message
    }]);
  }, []);

  // Update the last agent message
  const updateLastAgentMessage = useCallback((updates) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastIndex = newMessages.length - 1;
      if (lastIndex >= 0 && newMessages[lastIndex].role === 'agent') {
        newMessages[lastIndex] = {
          ...newMessages[lastIndex],
          ...updates
        };
      }
      return newMessages;
    });
  }, []);

  // Merge tool calls into the reply being streamed. A call arrives twice —
  // ToolCallStarted, then ToolCallCompleted with its result — under one
  // tool_call_id, so it is merged by id, the way agent-ui's
  // useAIStreamHandler does. The previous version wrote the `toolCalls` state
  // captured when sendMessage was created, so a reply never showed its calls.
  const mergeToolCalls = useCallback((incoming) => {
    if (!incoming || incoming.length === 0) return;
    const keyOf = (tc) => tc.tool_call_id || `${tc.tool_name}-${tc.created_at}`;
    const merge = (list = []) => incoming.reduce((acc, toolCall) => {
      const index = acc.findIndex((tc) => keyOf(tc) === keyOf(toolCall));
      if (index >= 0) {
        const next = [...acc];
        next[index] = { ...next[index], ...toolCall };
        return next;
      }
      return [...acc, { ...toolCall, tool_call_id: keyOf(toolCall) }];
    }, list);

    setToolCalls((prev) => merge(prev));
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'agent') return prev;
      return [...prev.slice(0, -1), { ...last, tool_calls: merge(last.tool_calls) }];
    });
  }, []);

  // Stream response handler
  const streamResponse = useCallback(async (apiUrl, requestBody, onChunk, onError, onComplete) => {
    let buffer = '';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': access ? `Bearer ${access}` : ''
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current?.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        const message = errorData.detail || errorData.error || `Request failed: ${response.status}`;
        if (/no llm provider/i.test(message)) {
          setLlmMissing(true);
          throw new Error(NO_LLM_MESSAGE);
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer = parseBuffer(buffer, onChunk);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        buffer = parseBuffer(buffer, onChunk);
      }
      onComplete();
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError(err);
        onComplete();
      }
    }
  }, [access]);

  // Send message
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || isStreaming) return;
    // No provider/agent picker: the assistant routes the message to a bot/flow
    // on the backend; nothing to select here.

    setError(null);
    setIsStreaming(true);
    setToolCalls([]);
    setReasoningSteps([]);

    addMessage({ role: 'user', content });
    setInputValue('');
    addMessage({ role: 'agent', content: '', tool_calls: [], streamingError: false });

    abortControllerRef.current = new AbortController();

    let lastContent = '';

    const handleChunk = (chunk) => {
      const event = chunk.event;

      if (event === RunEvent.RunStarted || event === RunEvent.ReasoningStarted) {
        if (chunk.session_id) {
          setSessionId(chunk.session_id);
          localStorage.setItem('ai_chat_session_id', chunk.session_id);

          // Add to sessions list
          if (!sessions.find(s => s.session_id === chunk.session_id)) {
            setSessions(prev => [{
              session_id: chunk.session_id,
              session_name: content.substring(0, 50),
              created_at: chunk.created_at || Date.now() / 1000
            }, ...prev]);
          }
        }
      } else if (event === RunEvent.ToolCallStarted || event === RunEvent.ToolCallCompleted) {
        if (chunk.tool) mergeToolCalls([chunk.tool]);
      } else if (event === RunEvent.RunContent) {
        if (typeof chunk.content === 'string') {
          const uniqueContent = chunk.content.replace(lastContent, '');
          setMessages(prev => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'agent') {
              last.content = (last.content || '') + uniqueContent;
            }
            return newMsgs;
          });
          lastContent = chunk.content;
        }

        if (chunk.tool) mergeToolCalls([chunk.tool]);
        if (chunk.tools) mergeToolCalls(chunk.tools);

        if (chunk.extra_data?.reasoning_steps) {
          setReasoningSteps(chunk.extra_data.reasoning_steps);
          updateLastAgentMessage({ extra_data: { reasoning_steps: chunk.extra_data.reasoning_steps } });
        }
      } else if (event === RunEvent.RunResponse) {
        // Stealth bot: each reply is a complete, discrete message. Render EVERY
        // reply — fill the streaming placeholder for the first, new bubble after.
        const text = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
        if (text) {
          setMessages(prev => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'agent' && !last.content) {
              last.content = text;
              return newMsgs;
            }
            return [...newMsgs, {
              id: generateId(),
              role: 'agent',
              content: text,
              created_at: Math.floor(Date.now() / 1000),
              tool_calls: [],
            }];
          });
        }
      } else if (event === RunEvent.ReasoningStep) {
        if (chunk.extra_data?.reasoning_steps) {
          setReasoningSteps(prev => [...prev, ...chunk.extra_data.reasoning_steps]);
        }
      } else if (event === RunEvent.RunCompleted) {
        const finalContent = typeof chunk.content === 'string'
          ? chunk.content
          : JSON.stringify(chunk.content);

        // RunCompleted is a TERMINATOR, not a payload. /api/vmls/generate sends
        // `content: ''` on completion because the text already arrived as
        // RunContent chunks -- so overwriting unconditionally blanked every
        // reply the instant it finished streaming. Only take the final content
        // when the event actually carries some.
        // Same for tools: the calls already streamed in; `tools` on completion
        // only fills gaps, it never replaces what is there.
        if (Array.isArray(chunk.tools)) mergeToolCalls(chunk.tools);
        const updates = { extra_data: chunk.extra_data };
        if (finalContent) updates.content = finalContent;
        updateLastAgentMessage(updates);
      } else if (event === RunEvent.RunError) {
        const errorContent = chunk.content || 'Error during run';
        setError(errorContent);
        updateLastAgentMessage({ content: errorContent, streamingError: true });
      }
    };

    const handleError = (err) => {
      setError(err.message);
      updateLastAgentMessage({ content: `Error: ${err.message}`, streamingError: true });
    };

    const handleComplete = () => {
      setIsStreaming(false);
      abortControllerRef.current = null;
      // Refresh sessions
      fetchSessions();
    };

    try {
      if (isMockMode) {
        // Use mock streaming response
        const generator = generateMockStreamResponse(content);
        for await (const chunk of generator) {
          handleChunk(chunk);
        }
        handleComplete();
      } else {
        await streamResponse(
          `${config.apiBaseUrl}/api/vmls/generate`,
          {
            message: content,
            session_id: sessionId,
            // The assistant with the MCP tools (lib/mediators/mcp/chat.rb on
            // the API), not the VML Lua generator this endpoint defaults to.
            mode: 'mcp',
            stream: true
          },
          handleChunk,
          handleError,
          handleComplete
        );
      }
    } catch (err) {
      handleError(err);
      handleComplete();
    }
  }, [isStreaming, sessionId, selectedAgent, sessions, isMockMode, addMessage, updateLastAgentMessage, mergeToolCalls, streamResponse, fetchSessions]);

  // Cancel request
  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  // Clear chat / New chat
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setSessionId(null);
    setToolCalls([]);
    setReasoningSteps([]);
    localStorage.removeItem('ai_chat_session_id');
  }, []);

  // Handle input
  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  }, [inputValue, sendMessage]);

  return {
    // Messages
    messages,
    inputValue,
    isStreaming,
    error,

    // Session
    sessionId,
    sessions,
    isLoadingSessions,
    loadSession,
    deleteSession,

    // Agents
    agents,
    selectedAgent,
    llmMissing,
    isLoadingAgents,
    handleAgentSelect,
    isEndpointActive,
    canManageProviders,

    // Tools & Reasoning
    toolCalls,
    reasoningSteps,

    // Actions
    sendMessage,
    cancelRequest,
    clearChat,
    handleInputChange,
    handleKeyPress,
    setInputValue,
    fetchAgents,
    fetchSessions
  };
};

export default useAIChat;
