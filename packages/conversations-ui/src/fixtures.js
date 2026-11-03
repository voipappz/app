// Sample props in the exact shapes Connectix sends (ChatJSON and the chat
// channel's pushes). For tests and the story; also exported as
// `@voipappz/conversations-ui/fixtures` so a host can check its own wiring.

export const conversations = [
  { id: 'c1', title: 'Refund for order 1042', handler: 'bot', inserted_at: '2026-11-02T09:00:00Z', updated_at: '2026-11-02T09:05:00Z' },
  { id: 'c2', title: 'Change delivery address', handler: 'human', inserted_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T08:30:00Z' },
  { id: 'c3', title: null, handler: 'bot', inserted_at: '2026-11-01T17:00:00Z', updated_at: '2026-11-01T17:00:00Z' }
];

const base = { html: null, name: null, display_text: null, hitl_decision: null, arguments: null, result: null, is_error: false, todos: null, format: null, data: null, status: 'completed' };

export const messages = [
  { ...base, id: 'm1', role: 'user', type: 'text', text: 'I want a refund for order 1042', inserted_at: '2026-11-02T09:00:00Z' },
  { ...base, id: 'm2', role: 'assistant', type: 'tool_call', name: 'lookup_order', display_text: 'Looking up the order', arguments: { order: '1042' }, inserted_at: '2026-11-02T09:00:02Z' },
  { ...base, id: 'm3', role: 'tool', type: 'tool_result', name: 'lookup_order', result: '{"status":"delivered"}', inserted_at: '2026-11-02T09:00:03Z' },
  { ...base, id: 'm4', role: 'assistant', type: 'todo_snapshot', todos: [{ id: 't1', content: 'Find the order', status: 'completed' }], inserted_at: '2026-11-02T09:00:04Z' },
  { ...base, id: 'm5', role: 'assistant', type: 'text', text: 'Order 1042 was delivered on Friday. I can refund it.', html: '<p>Order 1042 was delivered on Friday. I can refund it.</p>', inserted_at: '2026-11-02T09:00:05Z' }
];

export const failedToolMessages = [
  { ...base, id: 'f1', role: 'assistant', type: 'tool_call', name: 'refund', display_text: 'Refunding', arguments: { order: '1042' }, inserted_at: '2026-11-02T09:01:00Z' },
  { ...base, id: 'f2', role: 'tool', type: 'tool_result', name: 'refund', result: 'payment gateway down', is_error: true, inserted_at: '2026-11-02T09:01:01Z' }
];

export const errorMessage = { ...base, id: 'e1', role: 'assistant', type: 'error', text: 'The model is not reachable.', inserted_at: '2026-11-02T09:02:00Z' };

export const tools = [
  { name: 'Looking up the order', status: 'completed' },
  { name: 'Refunding', status: 'executing' }
];

export const todos = [
  { id: 't1', content: 'Find the order', status: 'completed' },
  { id: 't2', content: 'Check the refund policy', status: 'in_progress' },
  { id: 't3', content: 'Refund the customer', status: 'pending' }
];

export const approval = {
  type: 'approval',
  tools: [
    { name: 'refund', display_text: 'Refund $42 to the card', arguments: { order: '1042', amount: 42 } },
    { name: 'send_email', display_text: 'Email the customer', arguments: { to: 'customer@example.com' } }
  ]
};

export const questions = {
  type: 'questions',
  questions: [
    {
      question: 'Which refund method?',
      context: 'The customer paid by card.',
      multiple: false,
      allow_other: false,
      options: [
        { label: 'Card', value: 'card', description: '3-5 days' },
        { label: 'Store credit', value: 'credit', description: null }
      ]
    },
    {
      question: 'Anything to tell the customer?',
      context: null,
      multiple: true,
      allow_other: true,
      options: [
        { label: 'Apologise', value: 'apologise', description: null },
        { label: 'Offer a coupon', value: 'coupon', description: null }
      ]
    }
  ]
};

export const halt = { type: 'halt', message: 'The bot reached its tool-call limit.' };
