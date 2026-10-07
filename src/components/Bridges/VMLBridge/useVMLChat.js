import { useState, useCallback, useRef, useEffect } from 'react';
import { apiService } from '../../../services/apiService';
import { getVMLSessions, loadVMLSession, deleteVMLSession, sendVMLMessage } from '../../../services/api/vmlsApi';

/**
 * Run event types — same as AIChat
 */
const RunEvent = {
  RunStarted: 'RunStarted',
  RunContent: 'RunContent',
  RunCompleted: 'RunCompleted',
  RunError: 'RunError',
};

/**
 * Custom hook for VML AI Chat — mirrors useAIChat.js pattern
 * with EventStore-backed sessions and streaming.
 */
export const useVMLChat = () => {
  // Either session's token (an account's, else a portal user's).
  const access = apiService.getToken();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  // Session management
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('vml_chat_session_id') || null;
  });
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const abortControllerRef = useRef(null);

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!access) return;
    setIsLoadingSessions(true);
    try {
      const data = await getVMLSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch VML sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [access]);

  // Load session messages
  const loadSession = useCallback(async (sessionIdToLoad) => {
    if (!access || !sessionIdToLoad) return;
    try {
      const data = await loadVMLSession(sessionIdToLoad);
      const sessionMessages = data?.messages || [];

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
            created_at: entry.response.created_at || Date.now() / 1000
          });
        }
        return msgs;
      });

      setMessages(formattedMessages);
      setSessionId(sessionIdToLoad);
      localStorage.setItem('vml_chat_session_id', sessionIdToLoad);
    } catch (err) {
      console.error('Failed to load VML session:', err);
    }
  }, [access]);

  // Delete session
  const handleDeleteSession = useCallback(async (sessionIdToDelete) => {
    if (!access || !sessionIdToDelete) return;
    try {
      await deleteVMLSession(sessionIdToDelete);
      setSessions(prev => prev.filter(s => s.session_id !== sessionIdToDelete));
      if (sessionId === sessionIdToDelete) {
        setSessionId(null);
        setMessages([]);
        localStorage.removeItem('vml_chat_session_id');
      }
    } catch (err) {
      console.error('Failed to delete VML session:', err);
    }
  }, [access, sessionId]);

  // Initialize — fetch sessions on mount
  useEffect(() => {
    if (access) fetchSessions();
  }, [access, fetchSessions]);

  // Send message
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || isStreaming) return;

    setError(null);
    setIsStreaming(true);

    // Add user message
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'user',
      content,
      created_at: Math.floor(Date.now() / 1000)
    }]);
    setInputValue('');

    // Add placeholder agent message
    const agentMsgId = generateId();
    setMessages(prev => [...prev, {
      id: agentMsgId,
      role: 'agent',
      content: '',
      created_at: Math.floor(Date.now() / 1000),
      streamingError: false
    }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let lastContent = '';

    try {
      await sendVMLMessage({
        message: content,
        sessionId,
        signal: controller.signal,
        onChunk: (chunk) => {
          const event = chunk.event;

          if (event === RunEvent.RunStarted) {
            if (chunk.session_id) {
              setSessionId(chunk.session_id);
              localStorage.setItem('vml_chat_session_id', chunk.session_id);
              // Add to sessions list if new
              setSessions(prev => {
                if (prev.find(s => s.session_id === chunk.session_id)) return prev;
                return [{
                  session_id: chunk.session_id,
                  session_name: content.substring(0, 50),
                  created_at: chunk.created_at || Date.now() / 1000
                }, ...prev];
              });
            }
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
          } else if (event === RunEvent.RunCompleted) {
            const finalContent = typeof chunk.content === 'string'
              ? chunk.content
              : JSON.stringify(chunk.content);
            // Only update if RunCompleted has actual content
            if (finalContent) {
              setMessages(prev => {
                const newMsgs = [...prev];
                const last = newMsgs[newMsgs.length - 1];
                if (last && last.role === 'agent') {
                  last.content = finalContent || last.content;
                }
                return newMsgs;
              });
            }
          } else if (event === RunEvent.RunError) {
            setError(chunk.content || 'Error during generation');
            setMessages(prev => {
              const newMsgs = [...prev];
              const last = newMsgs[newMsgs.length - 1];
              if (last && last.role === 'agent') {
                last.content = chunk.content || 'Something went wrong.';
                last.streamingError = true;
              }
              return newMsgs;
            });
          }
        }
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setMessages(prev => {
          const newMsgs = [...prev];
          const last = newMsgs[newMsgs.length - 1];
          if (last && last.role === 'agent') {
            last.content = `Error: ${err.message}`;
            last.streamingError = true;
          }
          return newMsgs;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      fetchSessions();
    }
  }, [isStreaming, sessionId, fetchSessions]);

  // Cancel request
  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  // New chat
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setSessionId(null);
    localStorage.removeItem('vml_chat_session_id');
  }, []);

  // Get the last agent message content (for "Insert Code")
  const getLastAgentCode = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent' && messages[i].content && !messages[i].streamingError) {
        return messages[i].content;
      }
    }
    return '';
  }, [messages]);

  return {
    messages,
    inputValue,
    setInputValue,
    isStreaming,
    error,
    sessionId,
    sessions,
    isLoadingSessions,
    loadSession,
    deleteSession: handleDeleteSession,
    sendMessage,
    cancelRequest,
    clearChat,
    fetchSessions,
    getLastAgentCode
  };
};

export default useVMLChat;
