import { useCallback, useMemo, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { ChatView } from '@voipappz/chat-ui';
import { useAIChat, NO_LLM_MESSAGE } from './useAIChat';
import { useAIChatSidebar } from '../../context/AIChatSidebarContext';
import ProviderDialog from '../Providers/ProviderDialog/ProviderDialog';
import { providersApi } from '../../services/api/providersApi';

const SUGGESTIONS = [
  { label: 'Show me users with no active calls', prompt: 'List users who have no active calls right now' },
  { label: 'Explain Route bridge types', prompt: 'Explain the different Route bridge types and when to use each' },
  { label: 'How do I set up a queue?', prompt: 'How do I set up a call queue with agents?' },
  { label: 'Troubleshoot a failing device', prompt: 'Walk me through troubleshooting a failing device' },
  { label: 'Summarise recent call activity', prompt: 'Summarise the recent call activity and any anomalies' },
  { label: 'What reports are available?', prompt: 'What reports are available and what do they show?' },
];

// useAIChat speaks the VML run-event shape; the shared chat UI takes a neutral
// one. The mapping lives here so the package never learns the Assistant's API.
const toToolCall = (tc, idx) => {
  const done = tc.content !== undefined && tc.content !== null;
  return {
    id: tc.tool_call_id || `${tc.tool_name}-${idx}`,
    name: tc.tool_name,
    args: tc.tool_args,
    result: done ? tc.content : undefined,
    status: tc.tool_call_error === true ? 'error' : (done ? 'done' : 'running'),
  };
};

const toMessage = (m) => ({
  id: m.id,
  role: m.role === 'user' ? 'user' : 'assistant',
  content: m.content,
  createdAt: m.created_at,
  error: m.streamingError === true,
  toolCalls: (m.tool_calls || []).map(toToolCall),
  reasoning: m.extra_data?.reasoning_steps || [],
});

const toSession = (s) => ({ id: s.session_id, title: s.session_name || 'Chat Session' });

/**
 * The admin Assistant: useAIChat's state rendered with the shared chat UI.
 */
const AIChat = () => {
  const {
    messages,
    inputValue,
    isStreaming,
    sessionId,
    sessions,
    isLoadingSessions,
    loadSession,
    deleteSession,
    isLoadingAgents,
    llmMissing,
    isRestoringSession,
    isEndpointActive,
    canManageProviders,
    sendMessage,
    cancelRequest,
    clearChat,
    setInputValue,
    fetchAgents
  } = useAIChat();

  const { aiSidebarOpen, toggleAISidebar } = useAIChatSidebar();

  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogLoading, setProviderDialogLoading] = useState(false);
  const [llmServices, setLlmServices] = useState([]);

  const handleOpenProviderDialog = useCallback(async () => {
    try {
      const services = await providersApi.getLLMServices();
      setLlmServices(Array.isArray(services) ? services : []);
    } catch {
      setLlmServices([]);
    }
    setProviderDialogOpen(true);
  }, []);

  const handleSaveProvider = useCallback(async (data) => {
    setProviderDialogLoading(true);
    try {
      await providersApi.createProvider(data);
      setProviderDialogOpen(false);
      // Re-check, so the chat opens now that there is a provider
      fetchAgents();
    } finally {
      setProviderDialogLoading(false);
    }
  }, [fetchAgents]);

  const handleSuggestion = useCallback((prompt) => {
    setInputValue(prompt);
    sendMessage(prompt);
  }, [setInputValue, sendMessage]);

  const chatMessages = useMemo(() => messages.map(toMessage), [messages]);
  const chatSessions = useMemo(() => sessions.map(toSession), [sessions]);

  const status = isLoadingAgents
    ? { tone: 'checking', label: 'Checking…' }
    : (isEndpointActive ? { tone: 'ok', label: 'Connected' } : { tone: 'error', label: 'No LLM provider' });

  const notice = llmMissing ? (
    <Alert
      severity="warning"
      sx={{ maxWidth: 560, textAlign: 'left', mb: 2 }}
      action={canManageProviders && (
        <Button color="inherit" size="small" onClick={handleOpenProviderDialog}>Add LLM provider</Button>
      )}
    >
      {NO_LLM_MESSAGE}{!canManageProviders && ' Ask your administrator to add one.'}
    </Alert>
  ) : null;

  return (
    <ChatView
      title="AI Assistant"
      subtitle="Your data, through the VoipAppz tools"
      status={status}
      messages={chatMessages}
      sessions={chatSessions}
      selectedSessionId={sessionId}
      isLoadingSessions={isLoadingSessions}
      isRestoring={isRestoringSession}
      busy={isStreaming}
      inputValue={inputValue}
      onInputChange={setInputValue}
      onSend={sendMessage}
      onStop={cancelRequest}
      onSelectSession={loadSession}
      onDeleteSession={deleteSession}
      onNewSession={clearChat}
      sidebarCollapsed={!aiSidebarOpen}
      onToggleSidebar={toggleAISidebar}
      emptyState={{
        title: 'What can I help with?',
        description: llmMissing ? 'The assistant is not set up yet.' : 'Try one of these or type your own question.',
        notice,
        suggestions: llmMissing ? [] : SUGGESTIONS,
        onSuggestion: handleSuggestion,
        hint: llmMissing ? null : 'Tip: press Ctrl+Shift+A (or ⌘+Shift+A) to open this anywhere',
      }}
      composer={{
        placeholder: llmMissing ? 'Add an LLM provider to start' : 'Ask anything...',
        disabled: llmMissing,
      }}
    >
      <ProviderDialog
        open={providerDialogOpen}
        onClose={() => setProviderDialogOpen(false)}
        onSave={handleSaveProvider}
        provider={null}
        loading={providerDialogLoading}
        providerTypes={['llm']}
        llmServices={llmServices}
      />
    </ChatView>
  );
};

export default AIChat;
