// Surface-level checks for the toaster: that a raised toast actually reaches
// the screen, that it goes away on its own, and that an error does not. The
// queue rules themselves are unit-tested in toastQueue.test.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { DirectionProvider } from '../../context/DirectionContext';
import { ToastProvider, useToast } from '../../context/ToastContext';
import { TOAST_TTL_MS, toToast } from './toastQueue';
import '../../i18n/config';   // the toaster's copy goes through react-i18next

// A button is the smallest honest way to raise a toast from inside the tree.
function Raiser({ notification }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(toToast(notification))}>raise</button>;
}

const renderToaster = (notification) => render(
  <DirectionProvider>
    <ToastProvider>
      <Raiser notification={notification} />
    </ToastProvider>
  </DirectionProvider>,
);

describe('Toaster', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('shows nothing until something is raised', () => {
    renderToaster({ uuid: 'a', subject: 'Hi' });
    expect(screen.queryByTestId('toaster')).toBeNull();
  });

  it('shows a raised notification and auto-dismisses it', async () => {
    renderToaster({ uuid: 'a', level: 'info', subject: 'Backup finished', msg: 'All good' });
    fireEvent.click(screen.getByText('raise'));

    expect(screen.getByTestId('notification-toast')).toBeInTheDocument();
    expect(screen.getByText('Backup finished')).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(TOAST_TTL_MS + 600); });
    expect(screen.queryByTestId('notification-toast')).toBeNull();
  });

  it('keeps an error up until it is closed by hand', async () => {
    renderToaster({ uuid: 'e', level: 'error', subject: 'Database unreachable' });
    fireEvent.click(screen.getByText('raise'));

    await act(async () => { vi.advanceTimersByTime(TOAST_TTL_MS * 5); });
    const toast = screen.getByTestId('notification-toast');
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveAttribute('role', 'alert');   // errors interrupt, info doesn't

    fireEvent.click(screen.getByTestId('notification-toast-close'));
    await act(async () => {});
    expect(screen.queryByTestId('notification-toast')).toBeNull();
  });

  it('shows the same notification only once', () => {
    renderToaster({ uuid: 'a', subject: 'Once' });
    fireEvent.click(screen.getByText('raise'));
    fireEvent.click(screen.getByText('raise'));
    expect(screen.getAllByTestId('notification-toast')).toHaveLength(1);
  });
});
