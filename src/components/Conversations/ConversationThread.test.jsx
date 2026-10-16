import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ConversationThread from './ConversationThread.jsx';
import { threadEvents, conversations } from './fixtures';

const base = { selected: conversations[1], events: threadEvents, loading: false, canNotes: true, onNote: vi.fn(async () => true) };

describe('ConversationThread', () => {
  it('clears a draft when selecting a different call', () => {
    const { rerender } = render(<ConversationThread {...base} />);
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'For the first contact' } });
    rerender(<ConversationThread {...base} selected={conversations[3]} />);
    expect(screen.getByLabelText('Note')).toHaveValue('');
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

  it('shows one result per call, with earlier updates behind an accessible details button', () => {
    const callId = base.selected.call_uuid;
    const events = [
      { id: 'ring', at: '2026-10-16T12:00:00Z', kind: 'call', text: 'Call ringing', data: { call_uuid: callId } },
      { id: 'early', at: '2026-10-16T12:01:00Z', kind: 'call', data: { call_uuid: callId, summary: 'true', outcome: 'missed' } },
      { id: 'note', at: '2026-10-16T12:02:00Z', kind: 'note', text: 'Send the proposal', data: { call_uuid: callId } },
      { id: 'final', at: '2026-10-16T12:03:00Z', kind: 'call', data: { call_uuid: callId, summary: 'true', direction: 'outgoing', outcome: 'answered', duration: 180 } },
    ];
    render(<ConversationThread {...base} events={events} />);
    expect(screen.getAllByTestId('call-summary')).toHaveLength(1);
    expect(screen.getByText('Outgoing call')).toBeInTheDocument();
    expect(screen.getByText('Send the proposal')).toBeVisible();
    expect(screen.queryByText('Call ringing')).toBeNull();
    expect(screen.queryByText('Missed call')).toBeNull();
    const details = screen.getByRole('button', { name: 'Call details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(details);
    expect(screen.getByText('Call ringing')).toBeVisible();
    expect(screen.getByText('Missed call')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText('Call ringing')).toBeNull();
    expect(screen.getAllByTestId('call-summary')).toHaveLength(1);
  });

  it('flows calls, a note card and a tag change in one list', () => {
    render(<ConversationThread {...base} />);
    expect(screen.getAllByTestId('event-call')).toHaveLength(2);
    expect(screen.getByTestId('event-note')).toBeInTheDocument();
    expect(screen.getByTestId('event-tag')).toHaveTextContent('Tag added: renewal');
  });

  it('hides the composer without the notes permission', () => {
    render(<ConversationThread {...base} canNotes={false} />);
    expect(screen.queryByLabelText('Note')).toBeNull();
  });

  it('sends a note', async () => {
    render(<ConversationThread {...base} />);
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Call back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(base.onNote).toHaveBeenCalledWith('Call back'));
  });
});
