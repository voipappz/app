import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from '../../../i18n';
import CallDetailsScreen from './CallDetailsScreen';
import { callsApi } from '../../../services/api/callsApi';

const dialNow = vi.fn();
let canDial = true;
vi.mock('../../../hooks/useDialNow', () => ({ useDialNow: () => ({ canDial, dialNow }) }));
vi.mock('../../../services/api/callsApi', () => ({
  callsApi: { getTranscript: vi.fn(), getNumberHistory: vi.fn() },
}));

const call = {
  uuid: 'c1',
  created_at: '2026-10-13T11:05:00Z',
  recording: { url: 'https://files.example/c1.wav' },
  profile: {
    direction: 'incoming', cause: 'answer', caller: '0541234567', callee: '201', talk_duration: 151,
    did_name: 'Main line', queue_name: 'Support', user_name: 'Dana',
  },
};
const earlier = { uuid: 'c0', created_at: '2026-10-10T08:00:00Z', profile: { direction: 'outgoing', cause: 'no_answer', caller: '201', callee: '0541234567' } };

beforeEach(() => {
  canDial = true;
  dialNow.mockReset();
  callsApi.getTranscript.mockResolvedValue('Hello, I would like to book a table.');
  callsApi.getNumberHistory.mockResolvedValue([call, earlier]);
});
afterEach(() => i18n.changeLanguage('en'));

const renderScreen = (props = {}) => {
  const handlers = { onClose: vi.fn(), onOpenCall: vi.fn(), onViewEvents: vi.fn() };
  render(<CallDetailsScreen call={call} open canViewEvents {...handlers} {...props} />);
  return handlers;
};

describe('CallDetailsScreen', () => {
  it('shows who, when, the recording and the details', async () => {
    renderScreen();
    expect(screen.getByRole('dialog', { name: 'Call details' })).toBeInTheDocument();
    // The number heads the page, and is the "From" line of the details.
    expect(screen.getAllByText('0541234567', { selector: 'bdi' })).toHaveLength(2);
    expect(within(screen.getByTestId('call-details-recording')).getByRole('link', { name: 'Download' }))
      .toHaveAttribute('href', 'https://files.example/c1.wav');
    const info = screen.getByTestId('call-details-info');
    expect(info).toHaveTextContent('Answered');
    expect(info).toHaveTextContent('Main line');
    expect(info).toHaveTextContent('Support');
    expect(await screen.findByText('Hello, I would like to book a table.')).toBeInTheDocument();
  });

  it('calls back when the phone is connected', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(dialNow).toHaveBeenCalledWith('0541234567');
  });

  it('has no summary section until the server sends one', () => {
    renderScreen();
    expect(screen.queryByTestId('call-details-summary')).toBeNull();
  });

  it('says so when there is no transcription', async () => {
    callsApi.getTranscript.mockResolvedValue(null);
    renderScreen();
    expect(await screen.findByText('No transcription for this call')).toBeInTheDocument();
  });

  it('lists the other calls with this number, and opens one', async () => {
    const { onOpenCall } = renderScreen();
    expect(callsApi.getNumberHistory).toHaveBeenCalledWith('0541234567');
    const line = await screen.findByRole('button', { name: /^Unanswered call to .*0541234567/ });
    expect(within(screen.getByTestId('call-details-history')).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(line);
    expect(onOpenCall).toHaveBeenCalledWith(earlier);
  });

  it('offers events only with access to them', () => {
    const { onViewEvents } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(onViewEvents).toHaveBeenCalledWith(call);
  });

  it('hides events without access', () => {
    renderScreen({ canViewEvents: false });
    expect(screen.queryByRole('button', { name: 'Events' })).toBeNull();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderScreen();
    expect(screen.getByRole('dialog', { name: 'פרטי שיחה' })).toBeInTheDocument();
    expect(await screen.findByText('היסטוריה עם מספר זה')).toBeInTheDocument();
  });
});
