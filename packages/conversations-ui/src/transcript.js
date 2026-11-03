// Display messages (ChatJSON) -> the bubbles @voipappz/chat-ui draws.
//
// Connectix saves a tool call and its result as messages of their own. A
// chat bubble shows tools as chips on the assistant reply they led to, so
// tool calls are gathered and put on the next assistant text. Tools with no
// reply after them yet go on the streaming bubble while the turn runs, or on
// a bubble of their own (worded from their display text) once it has ended.
// Pure: no React, no state.

const STREAMING_ID = '__streaming';

const TOOL_STATUS = {
  identified: 'running',
  executing: 'running',
  interrupted: 'running',
  completed: 'done',
  failed: 'error'
};

/** A `tool` push status -> a ToolCallChip status. */
export const chipStatus = (status) => TOOL_STATUS[status] || 'running';

const toolCallFrom = (message) => ({
  id: message.id,
  name: message.display_text || message.name || 'tool',
  args: message.arguments || undefined,
  status: message.hitl_decision === 'rejected' ? 'error' : 'running'
});

// A result names its tool but not the call, so it settles the oldest
// unsettled call of that name.
const settle = (calls, result) => {
  const name = result.name;
  const call = calls.find((c) => c.status === 'running' && (c.toolName === name || !name));
  if (!call) return;
  call.status = result.is_error ? 'error' : 'done';
  call.result = result.result ?? undefined;
};

const strip = ({ toolName: _toolName, ...call }) => call;

const assistantText = (message, labels) => {
  if (message.type === 'structured_data') return labels.structuredData || `[${message.format || 'data'}]`;
  return message.text || '';
};

/**
 * @param {import('./contract').DisplayMessage[]} messages
 * @param {{status?: string, delta?: string | null, tools?: import('./contract').ToolStep[], labels?: Object}} [live]
 * @returns {Array<{id: string, role: 'user' | 'assistant', content: string, createdAt?: string, error?: boolean, toolCalls?: Object[]}>}
 */
export const toChatMessages = (messages = [], live = {}) => {
  const labels = live.labels || {};
  const bubbles = [];
  let calls = [];

  for (const message of messages) {
    switch (message.type) {
      case 'tool_call':
        calls.push({ ...toolCallFrom(message), toolName: message.name });
        break;
      case 'tool_result':
        settle(calls, message);
        break;
      case 'todo_snapshot':
        // The TODO list is drawn beside the thread, not in it.
        break;
      default: {
        if (message.role === 'user') {
          bubbles.push({ id: message.id, role: 'user', content: message.text || '', createdAt: message.inserted_at });
          break;
        }
        bubbles.push({
          id: message.id,
          role: 'assistant',
          content: assistantText(message, labels),
          createdAt: message.inserted_at,
          error: message.type === 'error' || undefined,
          toolCalls: calls.length > 0 ? calls.map(strip) : undefined
        });
        calls = [];
      }
    }
  }

  const liveCalls = (live.tools || []).map((tool, idx) => ({
    id: `${STREAMING_ID}-tool-${idx}`,
    name: tool.name,
    status: chipStatus(tool.status)
  }));
  const streaming = live.status === 'running' || (typeof live.delta === 'string' && live.delta.length > 0);

  if (streaming) {
    bubbles.push({
      id: STREAMING_ID,
      role: 'assistant',
      content: live.delta || '',
      toolCalls: [...calls.map(strip), ...liveCalls]
    });
  } else if (calls.length > 0) {
    bubbles.push({
      id: `${calls[0].id}-tools`,
      role: 'assistant',
      content: calls.map((c) => c.name).join('\n'),
      toolCalls: calls.map(strip)
    });
  }

  return bubbles;
};

export { STREAMING_ID };
