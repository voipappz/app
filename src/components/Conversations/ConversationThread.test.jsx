import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ConversationThread from './ConversationThread.jsx';
import { threadEvents, conversations } from './fixtures';

const base = { selected: conversations[1], events: threadEvents, loading: false, canNotes: true, onNote: vi.fn(async () => true) };

describe('ConversationThread', () => {
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
