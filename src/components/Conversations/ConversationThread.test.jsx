import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ConversationThread from './ConversationThread.jsx';
import { threadEvents, conversations } from './fixtures';

const base = { selected: conversations[1], events: threadEvents, loading: false, canNotes: true, canSms: true, onNote: vi.fn(async () => true), onSms: vi.fn(async () => true) };

describe('ConversationThread', () => {
  it('flows calls, an SMS, a note card and a tag change in one list', () => {
    render(<ConversationThread {...base} />);
    expect(screen.getAllByTestId('event-call')).toHaveLength(2);
    expect(screen.getByTestId('event-sms')).toHaveTextContent('annual plan still on offer');
    expect(screen.getByTestId('event-note')).toBeInTheDocument();
    expect(screen.getByTestId('event-tag')).toHaveTextContent('Tag added: renewal');
  });

  it('sends an SMS when that mode is picked', async () => {
    render(<ConversationThread {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'SMS' }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'On its way' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(base.onSms).toHaveBeenCalledWith('On its way'));
  });

  it('offers only SMS when notes are not granted, nothing when neither is', () => {
    const { rerender } = render(<ConversationThread {...base} canNotes={false} />);
    expect(screen.queryByRole('button', { name: 'Note' })).toBeNull();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    rerender(<ConversationThread {...base} canNotes={false} canSms={false} />);
    expect(screen.queryByLabelText('Message')).toBeNull();
  });
});
