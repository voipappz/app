import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';
import CallLogRow from './CallLogRow';
import { callsApi } from '../../../services/api/callsApi';

const dialNow = vi.fn();
let canDial = true;
vi.mock('../../../hooks/useDialNow', () => ({ useDialNow: () => ({ canDial, dialNow }) }));
vi.mock('../../../context/NotificationContext', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }));
vi.mock('../../../services/api/callsApi', () => ({ callsApi: { setNumberBlocked: vi.fn(async () => ({})) } }));

const call = (profile, extra = {}) => ({ uuid: 'c1', created_at: '2026-10-13T11:05:00Z', profile, ...extra });
const missed = call({ direction: 'incoming', cause: 'no_answer', caller: '0521234567', callee: '201' });
const answered = call({ direction: 'outgoing', cause: 'answer', caller: '201', callee: '035551234', talk_duration: 151 },
  { recording: { url: 'https://files.example/c1.wav' } });

beforeEach(() => { canDial = true; dialNow.mockReset(); });
afterEach(() => i18n.changeLanguage('en'));

const renderRow = (props) => {
  const onToggle = vi.fn();
  const onOpenDetails = vi.fn();
  render(<ul><CallLogRow expanded={false} onToggle={onToggle} onOpenDetails={onOpenDetails} {...props} /></ul>);
  return { onToggle, onOpenDetails };
};

describe('CallLogRow', () => {
  it('says what the call was, in words, on one line', () => {
    renderRow({ call: answered });
    const line = screen.getByRole('button', { name: /^Outgoing call to .*035551234/ });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(line).toHaveTextContent('035551234');
    expect(line).toHaveTextContent('2:31');
    expect(screen.queryByTestId('call-log-actions')).toBeNull();
  });

  it('marks a missed call and shows no duration', () => {
    renderRow({ call: missed });
    const line = screen.getByRole('button', { name: /^Missed call from .*0521234567/ });
    expect(line).toHaveTextContent('–');
  });

  it('opens in place on a tap', () => {
    const { onToggle } = renderRow({ call: answered });
    fireEvent.click(screen.getByRole('button', { name: /Outgoing call/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('offers call, recording, copy and details when open', () => {
    const { onOpenDetails } = renderRow({ call: answered, expanded: true });
    expect(screen.getByRole('button', { name: /Outgoing call/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy number' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(dialNow).toHaveBeenCalledWith('035551234');

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(onOpenDetails).toHaveBeenCalledWith(answered);
  });

  it('leaves Call out while the phone is not connected', () => {
    canDial = false;
    renderRow({ call: missed, expanded: true });
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play recording' })).toBeNull();
  });

  it('speaks Hebrew and keeps the number left to right', async () => {
    await i18n.changeLanguage('he');
    renderRow({ call: missed, expanded: true });
    expect(screen.getByRole('button', { name: /^שיחה שלא נענתה מ־/ })).toBeInTheDocument();
    expect(screen.getByText('0521234567').tagName).toBe('BDI');
    expect(screen.getByRole('button', { name: 'פרטים' })).toBeInTheDocument();
  });

  it('blocks the other party from the open line after asking, then asks for a refresh', async () => {
    window.confirm = vi.fn(() => true);
    const onBlockChanged = vi.fn();
    renderRow({ call: missed, expanded: true, onBlockChanged });
    fireEvent.click(screen.getByRole('button', { name: 'Block number' }));
    await waitFor(() => expect(onBlockChanged).toHaveBeenCalled());
    expect(callsApi.setNumberBlocked).toHaveBeenCalledWith('c1', true);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('0521234567'));
  });

  it('offers Unblock when the server says the number is blocked', () => {
    renderRow({ call: { ...missed, blacklisted: true }, expanded: true });
    expect(screen.getByRole('button', { name: 'Unblock number' })).toBeInTheDocument();
  });
});
