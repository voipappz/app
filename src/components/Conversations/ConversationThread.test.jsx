import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ConversationThread from './ConversationThread.jsx';
import { threadEvents, conversations } from './fixtures';

const base = { selected: conversations[1], events: threadEvents, loading: false, canNotes: true, onNote: vi.fn(async () => true) };

describe('ConversationThread', () => {
  it('clears a draft when selecting a different call', () => {
    const { rerender } = render(<ConversationThread {...base} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'For the first contact' } });
    rerender(<ConversationThread {...base} selected={conversations[3]} />);
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('renders the API summary event with duration and agent details', () => {
    render(<ConversationThread {...base} events={[{
      id: 'summary', kind: 'call', at: '2026-10-16T12:00:00Z', text: 'answered',
      data: { summary: 'true', call_uuid: base.selected.call_uuid, duration: 125, user_name: 'Dana', outcome: 'answered' },
    }]} />);
    expect(screen.getAllByTestId('call-summary')).toHaveLength(1);
    expect(screen.getByTestId('call-summary')).toHaveTextContent('02:05');
    expect(screen.getByTestId('call-summary')).toHaveTextContent('Dana');
  });

  it('flows calls, a note card and a tag change in one list', () => {
    render(<ConversationThread {...base} />);
    expect(screen.getAllByTestId('event-call')).toHaveLength(2);
    expect(screen.getByTestId('event-note')).toBeInTheDocument();
    expect(screen.getByTestId('event-tag')).toHaveTextContent('Tag added: renewal');
  });

  it('hides the composer without the notes permission', () => {
    render(<ConversationThread {...base} canNotes={false} />);
    expect(screen.queryByLabelText('Message')).toBeNull();
  });

  it('sends a note', async () => {
    render(<ConversationThread {...base} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Call back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(base.onNote).toHaveBeenCalledWith('Call back'));
  });
});
