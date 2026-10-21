import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { callsApi } from '../../../services/api/callsApi';
import { isolated } from '../../Phone/isolated';

const notify = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useCallNumber', () => ({ useCallNumber: () => vi.fn() }));
vi.mock('../../../context/NotificationContext', () => ({ useNotification: () => ({ showNotification: notify }) }));
vi.mock('../../../services/api/callsApi', () => ({ callsApi: { setNumberBlocked: vi.fn() } }));

import CallActions from './CallActions';

// A row as the API sends it.
const incoming = { uuid: 'c1', profile: { caller: '0501234567', callee: '201', direction: 'incoming' } };
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Call actions' }));
const pick = (name) => fireEvent.click(screen.getByRole('menuitem', { name }));

beforeEach(() => {
  callsApi.setNumberBlocked.mockReset().mockResolvedValue({ action: 'blacklist' });
  notify.mockReset();
  window.confirm = vi.fn(() => true);
});
afterEach(() => i18n.changeLanguage('en'));

describe('CallActions: block the number', () => {
  it('blocks the caller of an incoming call after asking, then asks the screen to refresh', async () => {
    const onBlockChanged = vi.fn();
    render(<CallActions call={incoming} onBlockChanged={onBlockChanged} />);
    openMenu();
    pick('Block number');

    await waitFor(() => expect(callsApi.setNumberBlocked).toHaveBeenCalledWith('c1', true));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('0501234567'));
    expect(notify).toHaveBeenCalledWith(`${isolated('0501234567')} is blocked`, 'success');
    expect(onBlockChanged).toHaveBeenCalled();
  });

  it('does nothing when the question is answered No', async () => {
    window.confirm = vi.fn(() => false);
    render(<CallActions call={incoming} />);
    openMenu();
    pick('Block number');
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(callsApi.setNumberBlocked).not.toHaveBeenCalled();
  });

  it('shows Unblock when the server says the number is blocked, and unblocks without asking', async () => {
    render(<CallActions call={{ ...incoming, blacklisted: true }} />);
    openMenu();
    pick('Unblock number');
    await waitFor(() => expect(callsApi.setNumberBlocked).toHaveBeenCalledWith('c1', false));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('says so when the server refuses, and does not refresh', async () => {
    callsApi.setNumberBlocked.mockRejectedValue(new Error('500'));
    const onBlockChanged = vi.fn();
    render(<CallActions call={incoming} onBlockChanged={onBlockChanged} />);
    openMenu();
    pick('Block number');
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("Couldn't change"), 'error'));
    expect(onBlockChanged).not.toHaveBeenCalled();
  });

  it('works on the same number as the rest of the app: the callee of an outgoing call', async () => {
    render(<CallActions call={{ uuid: 'c3', profile: { caller: '201', callee: '0541112222', direction: 'outgoing' } }} />);
    openMenu();
    pick('Block number');
    await waitFor(() => expect(notify).toHaveBeenCalledWith(`${isolated('0541112222')} is blocked`, 'success'));
  });

  it('is not offered when the call has no number to block', () => {
    render(<CallActions call={{ uuid: 'c2', profile: { direction: 'incoming' } }} />);
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Block number' })).not.toBeInTheDocument();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<CallActions call={incoming} />);
    fireEvent.click(screen.getByRole('button', { name: 'פעולות שיחה' }));
    expect(screen.getByRole('menuitem', { name: 'חסימת המספר' })).toBeInTheDocument();
  });
});
