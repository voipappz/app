import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  ConversationList,
  ConversationThread,
  ApprovalPanel,
  QuestionsPanel,
  PendingPanel,
  TodoList,
  HandlerToggle,
  toChatMessages,
  chipStatus,
  toResponse,
  isWaiting,
  NO_PENDING
} from './index';
import ConversationsStory from './ConversationsStory';
import * as fx from './fixtures';

describe('toChatMessages', () => {
  it('puts tool calls on the reply they led to and skips TODO snapshots', () => {
    const bubbles = toChatMessages(fx.messages);
    expect(bubbles.map((b) => [b.id, b.role])).toEqual([['m1', 'user'], ['m5', 'assistant']]);
    expect(bubbles[1].toolCalls).toEqual([
      { id: 'm2', name: 'Looking up the order', args: { order: '1042' }, status: 'done', result: '{"status":"delivered"}' }
    ]);
    expect(bubbles[0].createdAt).toBe('2026-11-02T09:00:00Z');
  });

  it('marks a failed tool and gives trailing tools a bubble of their own', () => {
    const bubbles = toChatMessages(fx.failedToolMessages);
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].content).toBe('Refunding');
    expect(bubbles[0].toolCalls[0]).toMatchObject({ status: 'error', result: 'payment gateway down' });
  });

  it('streams the delta and the live tools while running', () => {
    const bubbles = toChatMessages(fx.messages, { status: 'running', delta: 'Checking', tools: fx.tools });
    const last = bubbles.at(-1);
    expect(last).toMatchObject({ id: '__streaming', role: 'assistant', content: 'Checking' });
    expect(last.toolCalls.map((t) => t.status)).toEqual(['done', 'running']);
  });

  it('shows an empty streaming bubble while running with no text yet', () => {
    expect(toChatMessages([], { status: 'running' })).toEqual([
      { id: '__streaming', role: 'assistant', content: '', toolCalls: [] }
    ]);
  });

  it('marks error messages and names structured data', () => {
    const chart = { ...fx.errorMessage, id: 's1', type: 'structured_data', format: 'chart', text: null };
    const bubbles = toChatMessages([fx.errorMessage, chart]);
    expect(bubbles[0]).toMatchObject({ error: true, content: 'The model is not reachable.' });
    expect(bubbles[1].content).toBe('[chart]');
  });

  it('maps every tool push status', () => {
    expect(['identified', 'executing', 'interrupted', 'completed', 'failed', 'other'].map(chipStatus))
      .toEqual(['running', 'running', 'running', 'done', 'error', 'running']);
  });
});

describe('ConversationList', () => {
  it('shows title, handler and time for each row and selects', () => {
    const onSelect = vi.fn();
    render(<ConversationList conversations={fx.conversations} selectedId="c1" onSelect={onSelect} formatTimestamp={(iso) => `at ${iso}`} />);
    const rows = screen.getAllByTestId('conversation-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(within(rows[1]).getByTestId('conversation-handler')).toHaveAttribute('data-handler', 'human');
    expect(within(rows[0]).getByTestId('conversation-updated')).toHaveTextContent('at 2026-11-02T09:05:00Z');
    expect(within(rows[2]).getByText('New conversation')).toBeInTheDocument();
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('creates, deletes without selecting, and loads more', () => {
    const onNew = vi.fn();
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    const onLoadMore = vi.fn();
    render(<ConversationList conversations={fx.conversations} hasMore onNew={onNew} onDelete={onDelete} onSelect={onSelect} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByText('New'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete conversation' })[2]);
    fireEvent.click(screen.getByText('Load more'));
    expect(onNew).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith('c3');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows the empty and loading states', () => {
    const { rerender } = render(<ConversationList conversations={[]} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    rerender(<ConversationList conversations={[]} loading />);
    expect(screen.getAllByTestId('conversation-skeleton')).toHaveLength(3);
  });
});

describe('ApprovalPanel', () => {
  it('sends one decision per tool, in order, once all are decided', () => {
    const onDecide = vi.fn();
    render(<ApprovalPanel tools={fx.approval.tools} onDecide={onDecide} />);
    const send = screen.getByRole('button', { name: 'Send decisions' });
    expect(send).toBeDisabled();
    const [first, second] = screen.getAllByTestId('approval-tool');
    // Deciding the second tool first must not misalign the batch.
    fireEvent.click(within(second).getByRole('button', { name: 'Reject' }));
    fireEvent.click(within(first).getByRole('button', { name: 'Approve' }));
    fireEvent.click(send);
    expect(onDecide).toHaveBeenCalledWith(['approve', 'reject']);
  });

  it('approves or rejects all at once, and sends one batch per prompt', () => {
    const onDecide = vi.fn();
    render(<ApprovalPanel tools={fx.approval.tools} onDecide={onDecide} />);
    fireEvent.click(screen.getByText('Approve all'));
    fireEvent.click(screen.getByText('Reject all'));
    expect(onDecide.mock.calls).toEqual([[['approve', 'approve']]]);
    expect(screen.getByText('Reject all').closest('button')).toBeDisabled();
  });

  it('a new prompt with the same tools but other arguments starts undecided', () => {
    const onDecide = vi.fn();
    const tool = (id) => [{ name: 'refund', arguments: { order: id } }];
    const { rerender } = render(<ApprovalPanel tools={tool(1042)} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    rerender(<ApprovalPanel tools={tool(1043)} onDecide={onDecide} />);
    expect(screen.getByRole('button', { name: 'Send decisions' })).toBeDisabled();
  });
});

describe('QuestionsPanel', () => {
  it('answers every question in order, with free text where allowed', () => {
    const onAnswer = vi.fn();
    render(<QuestionsPanel questions={fx.questions.questions} onAnswer={onAnswer} />);
    const submit = screen.getByRole('button', { name: 'Answer' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Store credit/));
    fireEvent.click(screen.getByLabelText(/Card/));
    fireEvent.click(screen.getByLabelText(/Apologise/));
    fireEvent.click(screen.getByLabelText(/Offer a coupon/));
    fireEvent.click(screen.getByLabelText(/Offer a coupon/));
    fireEvent.change(screen.getByRole('textbox', { name: /Other/ }), { target: { value: ' Sorry! ' } });
    fireEvent.click(submit);
    expect(onAnswer).toHaveBeenCalledWith([
      { type: 'answer', selected: ['card'] },
      { type: 'answer', selected: ['apologise'], other_text: 'Sorry!' }
    ]);
  });

  it('skips by cancelling every question', () => {
    const onAnswer = vi.fn();
    render(<QuestionsPanel questions={fx.questions.questions} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText('Skip'));
    expect(onAnswer).toHaveBeenCalledWith([{ type: 'cancel' }, { type: 'cancel' }]);
  });

  it('builds a response from free text alone', () => {
    expect(toResponse({ selected: [], other: 'x' })).toEqual({ type: 'answer', selected: [], other_text: 'x' });
  });
});

describe('PendingPanel', () => {
  it('draws nothing when nothing is pending', () => {
    const { container } = render(<PendingPanel pending={NO_PENDING} />);
    expect(container).toBeEmptyDOMElement();
    expect(isWaiting(NO_PENDING)).toBe(false);
    expect(isWaiting(fx.halt)).toBe(true);
  });

  it('dismisses a halt', () => {
    const onDismiss = vi.fn();
    render(<PendingPanel pending={fx.halt} onDismiss={onDismiss} />);
    expect(screen.getByText('The bot reached its tool-call limit.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('TodoList and HandlerToggle', () => {
  it('lists TODOs with their status and progress', () => {
    render(<TodoList todos={fx.todos} />);
    expect(screen.getAllByTestId('todo').map((t) => t.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending']);
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it('takes over and hands back', () => {
    const onChange = vi.fn();
    const { rerender } = render(<HandlerToggle handler="bot" onChange={onChange} />);
    fireEvent.click(screen.getByText('Take over'));
    rerender(<HandlerToggle handler="human" onChange={onChange} />);
    fireEvent.click(screen.getByText('Hand back to bot'));
    expect(onChange.mock.calls).toEqual([['human'], ['bot']]);
  });
});

describe('ConversationThread', () => {
  const conversation = fx.conversations[0];

  it('renders the transcript, the status, the TODOs and sends', () => {
    const onSend = vi.fn();
    render(<ConversationThread conversation={conversation} messages={fx.messages} status="idle" todos={fx.todos} onSend={onSend} />);
    expect(screen.getAllByTestId('chat-message')).toHaveLength(2);
    expect(screen.getByTestId('thread-status')).toHaveTextContent('Ready');
    expect(screen.getAllByTestId('todo')).toHaveLength(3);
    const input = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: 'Refund it' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Refund it');
    expect(input).toHaveValue('');
  });

  it('cancels a running turn and shows the streamed reply', () => {
    const onCancel = vi.fn();
    render(<ConversationThread conversation={conversation} messages={fx.messages} status="running" delta="Checking the policy" tools={fx.tools} onCancel={onCancel} />);
    expect(screen.getByText('Checking the policy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('blocks typing while the bot waits and routes the decision', () => {
    const onDecide = vi.fn();
    render(<ConversationThread conversation={conversation} messages={fx.messages} status="interrupted" pending={fx.approval} onDecide={onDecide} />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    fireEvent.click(screen.getByText('Approve all'));
    expect(onDecide).toHaveBeenCalledWith(['approve', 'approve']);
  });

  it('routes answers and take-over', () => {
    const onAnswer = vi.fn();
    const onHandlerChange = vi.fn();
    render(<ConversationThread conversation={conversation} messages={[]} status="interrupted" pending={fx.questions} onAnswer={onAnswer} onHandlerChange={onHandlerChange} />);
    fireEvent.click(screen.getByText('Skip'));
    fireEvent.click(screen.getByText('Take over'));
    expect(onAnswer).toHaveBeenCalledWith([{ type: 'cancel' }, { type: 'cancel' }]);
    expect(onHandlerChange).toHaveBeenCalledWith('human');
  });

  it('lets a person reply while the conversation is taken over, with no stop button', () => {
    const human = { ...conversation, handler: 'human' };
    render(<ConversationThread conversation={human} messages={fx.messages} status="running" />);
    expect(screen.getByTestId('conversation-thread')).toHaveAttribute('data-handler', 'human');
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.getByText('Hand back to bot')).toBeInTheDocument();
  });

  it('shows a status error', () => {
    render(<ConversationThread conversation={conversation} messages={[]} status="error" error="The bot could not start." />);
    expect(screen.getByRole('alert')).toHaveTextContent('The bot could not start.');
  });

  it('honours a controlled input', () => {
    const onInputChange = vi.fn();
    render(<ConversationThread conversation={conversation} messages={[]} inputValue="draft" onInputChange={onInputChange} />);
    const input = screen.getByRole('textbox', { name: 'Message' });
    expect(input).toHaveValue('draft');
    fireEvent.change(input, { target: { value: 'draft 2' } });
    expect(onInputChange).toHaveBeenCalledWith('draft 2');
  });
});

describe('ConversationsStory', () => {
  it('renders every fixture state', () => {
    render(<ConversationsStory />);
    for (const name of ['approval', 'questions', 'halt', 'error', 'idle', 'streaming']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByTestId('conversation-thread')).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('conversation-row')).toHaveLength(3);
  });
});
