import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ConversationList from './ConversationList';
import ConversationThread from './ConversationThread';
import { NO_PENDING } from './contract';
import * as fx from './fixtures';

// Every state the screens draw, from the fixtures, for a visual check in any
// host (`import ConversationsStory from '@voipappz/conversations-ui/story'`).
// Callbacks only log; there is no backend.
const STATES = {
  streaming: { status: 'running', delta: 'Let me check the refund policy', tools: fx.tools, pending: NO_PENDING },
  approval: { status: 'interrupted', pending: fx.approval },
  questions: { status: 'interrupted', pending: fx.questions },
  halt: { status: 'interrupted', pending: fx.halt },
  error: { status: 'error', error: 'The bot could not start.', pending: NO_PENDING },
  idle: { status: 'idle', pending: NO_PENDING }
};

const log = (name) => (...args) => console.info(`[conversations-ui story] ${name}`, ...args);

const ConversationsStory = ({ initialState = 'streaming' }) => {
  const [state, setState] = useState(initialState);
  const [selectedId, setSelectedId] = useState(fx.conversations[0].id);
  const conversation = fx.conversations.find((c) => c.id === selectedId);

  return (
    <Box data-testid="conversations-story" sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <ToggleButtonGroup size="small" exclusive value={state} onChange={(_e, v) => v && setState(v)} sx={{ p: 1 }}>
        {Object.keys(STATES).map((name) => <ToggleButton key={name} value={name}>{name}</ToggleButton>)}
      </ToggleButtonGroup>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ width: 280, flexShrink: 0 }}>
          <ConversationList
            conversations={fx.conversations}
            selectedId={selectedId}
            hasMore
            onSelect={setSelectedId}
            onNew={log('new')}
            onDelete={log('delete')}
            onLoadMore={log('load more')}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ConversationThread
            conversation={conversation}
            messages={fx.messages}
            todos={fx.todos}
            {...STATES[state]}
            onSend={log('send')}
            onCancel={log('cancel')}
            onDecide={log('decide')}
            onAnswer={log('answer')}
            onDismiss={log('dismiss')}
            onHandlerChange={log('handler')}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default ConversationsStory;
