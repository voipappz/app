import { useMemo, useState } from 'react';
import { Box, Chip } from '@mui/material';
import { ChatView } from '@voipappz/chat-ui';
import { toChatMessages } from './transcript';
import { isBusy, isWaiting, NO_PENDING } from './contract';
import PendingPanel from './PendingPanel';
import TodoList from './TodoList';
import HandlerToggle from './HandlerToggle';

const STATUS_TONE = {
  running: 'warn',
  idle: 'ok',
  interrupted: 'warn',
  error: 'error',
  cancelled: 'checking',
  not_running: 'checking'
};

const STATUS_LABEL = {
  running: 'Working',
  idle: 'Ready',
  interrupted: 'Waiting for you',
  error: 'Error',
  cancelled: 'Stopped',
  not_running: 'Asleep'
};

/** The status as words, for the header. */
export const statusLabel = (status, labels = {}) =>
  labels[`status_${status}`] || STATUS_LABEL[status] || status || '';

/**
 * One conversation with its bot: the transcript with the reply streaming in
 * and the tools it uses, whatever the bot waits on (approval, questions,
 * halt), its TODO list, take-over / hand-back, and stop.
 *
 * Built on @voipappz/chat-ui's ChatView. The input text is kept here unless
 * the host controls it with `inputValue` / `onInputChange`.
 *
 * @param {import('./contract').ConversationThreadProps} props
 */
const ConversationThread = ({
  conversation,
  messages = [],
  status = 'not_running',
  error,
  delta = null,
  tools = [],
  pending = NO_PENDING,
  todos = [],
  inputValue,
  onInputChange,
  onSend,
  onCancel,
  onDecide,
  onAnswer,
  onDismiss,
  onHandlerChange,
  labels = {}
}) => {
  const [localInput, setLocalInput] = useState('');
  const controlled = inputValue !== undefined;
  const input = controlled ? inputValue : localInput;
  const setInput = (text) => {
    if (!controlled) setLocalInput(text);
    onInputChange?.(text);
  };

  const bubbles = useMemo(
    () => toChatMessages(messages, { status, delta, tools, labels }),
    [messages, status, delta, tools, labels]
  );

  const handler = conversation?.handler || 'bot';
  const human = handler === 'human';
  const waiting = isWaiting(pending);
  const busy = !human && isBusy(status);

  const send = (text) => {
    onSend?.(text);
    setInput('');
  };

  const footer = (waiting || (status === 'error' && error)) ? (
    <Box sx={{ px: 2 }}>
      {status === 'error' && error && (
        <Box data-testid="thread-error" role="alert" sx={{ mx: 'auto', my: 1, maxWidth: 800, color: 'var(--color-danger, #ef4444)', fontSize: '0.85rem' }}>
          {error}
        </Box>
      )}
      <PendingPanel pending={pending} onDecide={onDecide} onAnswer={onAnswer} onDismiss={onDismiss} labels={labels} />
    </Box>
  ) : null;

  const placeholder = waiting
    ? (labels.answerFirst || 'Answer the bot first')
    : human
      ? (labels.humanPlaceholder || 'You are answering. Type your reply...')
      : (labels.placeholder || 'Message the bot...');

  return (
    <Box data-testid="conversation-thread" data-status={status} data-handler={handler} sx={{ display: 'flex', height: '100%', minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ChatView
          title={conversation?.title || labels.untitled || 'New conversation'}
          messages={bubbles}
          busy={busy}
          inputValue={input}
          onInputChange={setInput}
          onSend={send}
          onStop={onCancel}
          labels={labels}
          emptyState={{ title: labels.emptyTitle || 'No messages yet', description: labels.emptyDescription }}
          composer={{ disabled: waiting || !conversation, placeholder }}
          headerActions={
            <>
              <Chip
                size="small"
                data-testid="thread-status"
                data-tone={STATUS_TONE[status] || 'checking'}
                label={statusLabel(status, labels)}
                sx={{ fontSize: '0.7rem' }}
              />
              {conversation && <HandlerToggle handler={handler} onChange={onHandlerChange} labels={labels} />}
            </>
          }
          footer={footer}
        />
      </Box>
      <Box
        component="aside"
        sx={{ width: 260, flexShrink: 0, borderInlineStart: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-bg-primary)', overflow: 'auto' }}
      >
        <TodoList todos={todos} labels={labels} />
      </Box>
    </Box>
  );
};

export default ConversationThread;
