import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Tooltip,
  Chip,
  CircularProgress,
  Skeleton,
  Alert,
  Button,
  Divider
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopIcon from '@mui/icons-material/Stop';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AddIcon from '@mui/icons-material/Add';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAIChat, NO_LLM_MESSAGE } from './useAIChat';
import { useAIChatSidebar } from '../../context/AIChatSidebarContext';
import ProviderDialog from '../Providers/ProviderDialog/ProviderDialog';
import { providersApi } from '../../services/api/providersApi';
import './AIChat.css';

/**
 * Tool Call Component — one chip per call, as agent-ui draws them, plus its
 * state: a spinner while the tool runs (ToolCallStarted), the tool icon once
 * its result is in (ToolCallCompleted), red when the tool reported an error.
 * The arguments and result sit in the tooltip.
 */
const ToolCallItem = memo(({ toolCall }) => {
  const done = toolCall.content !== undefined && toolCall.content !== null;
  const failed = toolCall.tool_call_error === true;
  const status = failed ? 'error' : (done ? 'done' : 'running');
  const args = toolCall.tool_args && Object.keys(toolCall.tool_args).length > 0
    ? JSON.stringify(toolCall.tool_args)
    : '';
  const detail = [args && `args: ${args}`, done && String(toolCall.content).slice(0, 800)]
    .filter(Boolean)
    .join('\n\n');
  const icon = status === 'running'
    ? <CircularProgress size={12} sx={{ color: 'var(--theme-text-secondary)' }} />
    : (failed ? <ErrorOutlineIcon sx={{ fontSize: 14 }} /> : <BuildIcon sx={{ fontSize: 14 }} />);

  return (
    <Tooltip
      placement="top"
      arrow
      title={detail
        ? <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.7rem' }}>{detail}</Box>
        : ''}
    >
      <Chip
        icon={icon}
        label={toolCall.tool_name}
        size="small"
        data-testid="ai-chat-tool-call"
        data-status={status}
        sx={{
          backgroundColor: 'var(--theme-bg-secondary)',
          color: failed ? '#ef4444' : 'var(--theme-text-secondary)',
          fontSize: '0.7rem',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          '& .MuiChip-icon': { color: failed ? '#ef4444' : 'var(--theme-text-secondary)', ml: '6px' }
        }}
      />
    </Tooltip>
  );
});
ToolCallItem.displayName = 'ToolCallItem';

/**
 * Reasoning Step Component
 */
const ReasoningStep = memo(({ step, index }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Chip
      label={`STEP ${index + 1}`}
      size="small"
      sx={{
        backgroundColor: 'var(--theme-bg-secondary)',
        color: 'var(--theme-text-secondary)',
        fontSize: '0.65rem',
        height: 20
      }}
    />
    <Typography sx={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)' }}>
      {step.title}
    </Typography>
  </Box>
));
ReasoningStep.displayName = 'ReasoningStep';

/**
 * Loading Dots Animation
 */
const LoadingDots = () => (
  <Box className="ai-chat-loading">
    <Box className="ai-chat-loading-dots">
      <Box className="ai-chat-loading-dot" />
      <Box className="ai-chat-loading-dot" />
      <Box className="ai-chat-loading-dot" />
    </Box>
  </Box>
);

/**
 * Copy button for agent messages
 */
const CopyButton = memo(({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
      <IconButton size="small" onClick={handleCopy} sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, p: 0.25 }}>
        {copied
          ? <CheckIcon sx={{ fontSize: 14, color: '#22c55e' }} />
          : <ContentCopyIcon sx={{ fontSize: 14, color: 'var(--theme-text-secondary)' }} />}
      </IconButton>
    </Tooltip>
  );
});
CopyButton.displayName = 'CopyButton';

/**
 * Agent Message Component — left-aligned bubble (WhatsApp style)
 */
const AgentMessage = memo(({ message }) => {
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasReasoning = message.extra_data?.reasoning_steps && message.extra_data.reasoning_steps.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {hasReasoning && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Tooltip title="Reasoning">
            <PsychologyIcon sx={{ fontSize: 16, color: 'var(--accent-primary, #65758E)' }} />
          </Tooltip>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'var(--theme-text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Reasoning
            </Typography>
            {message.extra_data.reasoning_steps.map((step, idx) => (
              <ReasoningStep key={`${step.title}-${idx}`} step={step} index={idx} />
            ))}
          </Box>
        </Box>
      )}

      {hasToolCalls && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
          {message.tool_calls.map((tc, idx) => (
            <ToolCallItem
              key={tc.tool_call_id || `${tc.tool_name}-${idx}`}
              toolCall={tc}
            />
          ))}
        </Box>
      )}

      {message.streamingError ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444' }}>
          <ErrorOutlineIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ color: '#ef4444', fontSize: '0.9rem' }}>
            {message.content || 'Something went wrong. Please try again.'}
          </Typography>
        </Box>
      ) : message.content ? (
        <Typography component="div" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {message.content}
        </Typography>
      ) : (
        <LoadingDots />
      )}
    </Box>
  );
});
AgentMessage.displayName = 'AgentMessage';

/**
 * User Message Component
 */
const UserMessage = memo(({ message }) => (
  <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5 }}>
    {message.content}
  </Typography>
));
UserMessage.displayName = 'UserMessage';

/**
 * Session Item Component
 */
const SessionItem = memo(({ session, isSelected, onClick, onDelete }) => (
  <Box
    onClick={onClick}
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      p: 1.5,
      borderRadius: '8px',
      cursor: 'pointer',
      backgroundColor: isSelected ? 'var(--theme-bg-secondary)' : 'transparent',
      '&:hover': {
        backgroundColor: 'var(--theme-hover)',
      },
      transition: 'background-color 0.2s'
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
      <ChatBubbleOutlineIcon sx={{ fontSize: 16, color: 'var(--theme-text-tertiary)', flexShrink: 0 }} />
      <Typography
        sx={{
          fontSize: '0.8rem',
          color: isSelected ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {session.session_name || 'Chat Session'}
      </Typography>
    </Box>
    <IconButton
      size="small"
      onClick={(e) => {
        e.stopPropagation();
        onDelete(session.session_id);
      }}
      sx={{
        opacity: 0,
        '.MuiBox-root:hover &': { opacity: 1 },
        color: 'var(--theme-text-tertiary)',
        '&:hover': { color: '#ef4444' }
      }}
    >
      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
    </IconButton>
  </Box>
));
SessionItem.displayName = 'SessionItem';

/**
 * AI Chat Sidebar Component
 */
const AIChatSidebar = ({
  isCollapsed,
  onToggle,
  isLoadingAgents,
  sessions,
  sessionId,
  isLoadingSessions,
  onSessionClick,
  onDeleteSession,
  onNewChat,
  messagesCount,
  isEndpointActive
}) => (
  <Box
    sx={{
      width: isCollapsed ? 40 : 256,
      height: '100%',
      backgroundColor: 'var(--theme-bg-secondary)',
      borderRight: '1px solid var(--theme-border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.3s ease',
      overflow: 'hidden',
      flexShrink: 0
    }}
  >
    {/* Toggle Button */}
    <IconButton
      onClick={onToggle}
      sx={{
        position: 'absolute',
        right: 8,
        top: 8,
        color: 'var(--theme-text-secondary)',
        zIndex: 10
      }}
    >
      {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
    </IconButton>

    {!isCollapsed && (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon sx={{ color: 'var(--accent-primary, #65758E)', fontSize: 20 }} />
          <Typography sx={{ color: 'var(--theme-text-primary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            AI Assistant
          </Typography>
        </Box>

        {/* New Chat Button */}
        <Box
          onClick={messagesCount === 0 ? undefined : onNewChat}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            p: 1.5,
            backgroundColor: 'var(--accent-primary, #65758E)',
            color: '#fff',
            borderRadius: '12px',
            cursor: messagesCount === 0 ? 'not-allowed' : 'pointer',
            opacity: messagesCount === 0 ? 0.5 : 1,
            '&:hover': {
              opacity: messagesCount === 0 ? 0.5 : 0.9
            }
          }}
        >
          <AddIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            New Chat
          </Typography>
        </Box>

        {/* Status: there is one assistant, no agent to pick */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Status indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: isLoadingAgents ? 'var(--color-neutral)' : (isEndpointActive ? 'var(--color-success)' : 'var(--color-danger)')
              }}
            />
            <Typography sx={{ fontSize: '0.65rem', color: 'var(--theme-text-tertiary)' }}>
              {isLoadingAgents ? 'Checking…' : (isEndpointActive ? 'Connected' : 'No LLM provider')}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: 'var(--theme-border)' }} />

        {/* Sessions */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflow: 'hidden' }}>
          <Typography sx={{ color: 'var(--theme-text-primary)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Sessions
          </Typography>

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {isLoadingSessions ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} variant="rounded" height={40} sx={{ backgroundColor: 'var(--theme-bg-secondary)' }} />
                ))}
              </Box>
            ) : sessions.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 32, color: 'var(--theme-border)', mb: 1 }} />
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--theme-text-tertiary)' }}>
                  No sessions yet
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {sessions.map((session) => (
                  <SessionItem
                    key={session.session_id}
                    session={session}
                    isSelected={sessionId === session.session_id}
                    onClick={() => onSessionClick(session.session_id)}
                    onDelete={onDeleteSession}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    )}
  </Box>
);

/**
 * AI Chat Component — WhatsApp-style layout
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
    isEndpointActive,
    canManageProviders,
    sendMessage,
    cancelRequest,
    clearChat,
    handleInputChange,
    handleKeyPress,
    setInputValue,
    fetchAgents
  } = useAIChat();

  const { aiSidebarOpen, toggleAISidebar } = useAIChatSidebar();
  const isSidebarCollapsed = !aiSidebarOpen;
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Provider dialog state
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogLoading, setProviderDialogLoading] = useState(false);
  const [llmServices, setLlmServices] = useState([]);

  const handleOpenProviderDialog = useCallback(async () => {
    // Fetch LLM services for the dialog dropdown
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const formatTime = (timestamp) => {
    const date = typeof timestamp === 'number' && timestamp < 9999999999
      ? new Date(timestamp * 1000)
      : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSuggestionClick = (prompt) => {
    setInputValue(prompt);
    sendMessage(prompt);
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', backgroundColor: 'var(--theme-bg-primary)' }}>
      {/* Sidebar */}
      <AIChatSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={toggleAISidebar}
        isLoadingAgents={isLoadingAgents}
        sessions={sessions}
        sessionId={sessionId}
        isLoadingSessions={isLoadingSessions}
        onSessionClick={loadSession}
        onDeleteSession={deleteSession}
        onNewChat={clearChat}
        messagesCount={messages.length}
        isEndpointActive={isEndpointActive}
      />

      {/* Main Chat Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Header */}
        <Box sx={{
          p: 2,
          borderBottom: '1px solid var(--theme-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--theme-bg-secondary)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'var(--accent-primary, #65758E)', width: 36, height: 36 }}>
              <SmartToyIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Box>
              <Typography sx={{ color: 'var(--theme-text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
                AI Assistant
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: 'var(--theme-text-tertiary)', fontSize: '0.75rem' }}>
                  Your data, through the VoipAppz tools
                </Typography>
                {isStreaming && <CircularProgress size={12} sx={{ color: 'var(--accent-primary, #65758E)' }} />}
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Messages Area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {messages.length === 0 ? (
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center'
            }}>
              <SmartToyIcon sx={{ fontSize: 52, color: 'var(--accent-primary, #65758E)', mb: 2, opacity: 0.7 }} />
              <Typography sx={{ color: 'var(--theme-text-primary)', fontSize: '1.3rem', fontWeight: 600, mb: 0.5 }}>
                What can I help with?
              </Typography>
              <Typography sx={{ color: 'var(--theme-text-tertiary)', fontSize: '0.9rem', mb: 3 }}>
                {llmMissing ? 'The assistant is not set up yet.' : 'Try one of these or type your own question.'}
              </Typography>
              {llmMissing && (
                <Alert
                  severity="warning"
                  sx={{ maxWidth: 560, textAlign: 'left', mb: 2 }}
                  action={canManageProviders && (
                    <Button color="inherit" size="small" onClick={handleOpenProviderDialog}>Add LLM provider</Button>
                  )}
                >
                  {NO_LLM_MESSAGE}{!canManageProviders && ' Ask your administrator to add one.'}
                </Alert>
              )}
              {!llmMissing && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', maxWidth: 560 }}>
                  {[
                    { label: 'Show me users with no active calls', prompt: 'List users who have no active calls right now' },
                    { label: 'Explain Route bridge types', prompt: 'Explain the different Route bridge types and when to use each' },
                    { label: 'How do I set up a queue?', prompt: 'How do I set up a call queue with agents?' },
                    { label: 'Troubleshoot a failing device', prompt: 'Walk me through troubleshooting a failing device' },
                    { label: 'Summarise recent call activity', prompt: 'Summarise the recent call activity and any anomalies' },
                    { label: 'What reports are available?', prompt: 'What reports are available and what do they show?' },
                  ].map((item, idx) => (
                    <Chip
                      key={idx}
                      label={item.label}
                      onClick={() => handleSuggestionClick(item.prompt)}
                      sx={{
                        backgroundColor: 'var(--theme-bg-secondary)',
                        color: 'var(--theme-text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        py: 0.5,
                        border: '1px solid var(--theme-border)',
                        '&:hover': { backgroundColor: 'var(--accent-primary, #65758E)', color: '#fff', borderColor: 'var(--accent-primary, #65758E)' }
                      }}
                    />
                  ))}
                </Box>
              )}
              {!llmMissing && (
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--theme-text-tertiary)', mt: 2 }}>
                  Tip: press Ctrl+Shift+A (or ⌘+Shift+A) to open this anywhere
                </Typography>
              )}
            </Box>
          ) : (
            <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <Box
                    key={message.id}
                    sx={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '70%',
                        minWidth: 60,
                      }}
                    >
                      {/* Chat Bubble */}
                      <Box
                        sx={{
                          px: 2,
                          py: 1.5,
                          borderRadius: isUser
                            ? '16px 16px 4px 16px'
                            : '16px 16px 16px 4px',
                          backgroundColor: isUser
                            ? 'var(--accent-primary, #65758E)'
                            : 'var(--theme-bg-secondary)',
                          color: isUser
                            ? '#fff'
                            : 'var(--theme-text-primary)',
                          border: isUser
                            ? 'none'
                            : '1px solid var(--theme-border)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                        }}
                      >
                        {isUser ? (
                          <UserMessage message={message} />
                        ) : (
                          <AgentMessage message={message} />
                        )}
                      </Box>
                      {/* Timestamp + copy */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isUser ? 'flex-end' : 'space-between', mt: 0.5, px: 0.5, gap: 1 }}>
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--theme-text-tertiary)' }}>
                          {formatTime(message.created_at)}
                        </Typography>
                        {!isUser && message.content && !message.streamingError && (
                          <CopyButton text={message.content} />
                        )}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
              <div ref={messagesEndRef} />
            </Box>
          )}
        </Box>

        {/* Input Area */}
        <Box sx={{
          p: 2,
          borderTop: '1px solid var(--theme-border)',
          backgroundColor: 'var(--theme-bg-secondary)'
        }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 1,
            maxWidth: 800,
            mx: 'auto'
          }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={4}
              placeholder={llmMissing ? 'Add an LLM provider to start' : 'Ask anything...'}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              disabled={isStreaming || llmMissing}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '16px',
                  backgroundColor: 'var(--theme-bg-primary)',
                  color: 'var(--theme-text-primary)',
                  '& fieldset': { borderColor: 'var(--theme-border)' },
                  '&:hover fieldset': { borderColor: 'var(--theme-text-secondary)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary, #65758E)' }
                },
                '& .MuiInputBase-input': {
                  '&::placeholder': { color: 'var(--theme-text-tertiary)', opacity: 1 }
                }
              }}
            />
            {isStreaming ? (
              <IconButton
                onClick={cancelRequest}
                sx={{
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  '&:hover': { backgroundColor: '#dc2626' }
                }}
              >
                <StopIcon />
              </IconButton>
            ) : (
              <IconButton
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || llmMissing}
                sx={{
                  backgroundColor: 'var(--accent-primary, #65758E)',
                  color: '#fff',
                  '&:hover': { opacity: 0.9, backgroundColor: 'var(--accent-primary, #65758E)' },
                  '&.Mui-disabled': { backgroundColor: 'var(--theme-bg-secondary)', color: 'var(--theme-text-tertiary)' }
                }}
              >
                <SendIcon />
              </IconButton>
            )}
          </Box>
          <Typography sx={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--theme-text-tertiary)', mt: 1 }}>
            Press Enter to send, Shift+Enter for new line
          </Typography>
        </Box>
      </Box>
      {/* Provider creation dialog */}
      <ProviderDialog
        open={providerDialogOpen}
        onClose={() => setProviderDialogOpen(false)}
        onSave={handleSaveProvider}
        provider={null}
        loading={providerDialogLoading}
        providerTypes={['llm']}
        llmServices={llmServices}
      />
    </Box>
  );
};

export default AIChat;
