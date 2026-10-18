import { useCallback, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette';
import { useSearchShortcuts } from './useSearchShortcuts';

const navigate = vi.fn();
const apiGet = vi.fn();

vi.mock('react-router', async (original) => ({ ...(await original()), useNavigate: () => navigate }));
vi.mock('../AIChat/AIChat.jsx', () => ({
  default: ({ initialQuestion }) => <div data-testid="ai-chat">{initialQuestion}</div>,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, acl: {}, logout: vi.fn() }),
}));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));
vi.mock('../../context/ThemeContext', () => ({ useThemeMode: () => ({ isDarkMode: false, toggleTheme: vi.fn() }) }));
vi.mock('../../context/RecentPagesContext', () => ({
  useRecentPages: () => ({ recentPages: [{ path: '/calls', label: 'Calls', timestamp: Date.now() - 60000 }] }),
}));
vi.mock('../../context/PortalSidebarContext', () => ({ usePortalSidebar: () => ({ open: vi.fn() }) }));
vi.mock('../../hooks/useCallNumber', () => ({ useCallNumber: () => vi.fn() }));
vi.mock('../../utils/recentObjects', () => ({ readRecentObjects: () => [] }));
vi.mock('../../config/navConfig', () => ({
  getPermittedNavItems: () => [
    { text: 'Calls', labelKey: 'nav:calls', path: '/calls' },
    { text: 'Devices', labelKey: 'nav:devices', path: '/extensions' },
  ],
}));
vi.mock('../../services/apiService', () => ({
  apiService: { get: (...args) => apiGet(...args), getToken: () => 'token' },
}));

// What the fan-out gets back: two calls (of 12) and one device match 054.
const answerSearch = async (url) => {
  if (url.startsWith('/api/calls')) {
    return { data: [{ uuid: 'c1', caller: '0541234567', callee: '200' }, { uuid: 'c2', caller: '0549999999', callee: '201' }], total: 12 };
  }
  if (url.startsWith('/api/devices')) return [{ uuid: 'd1', name: 'Desk 054', username: '1054' }];
  return [];
};

const typeQuery = async (value) => {
  const input = screen.getByRole('textbox', { name: 'Search' });
  fireEvent.change(input, { target: { value } });
  await screen.findByRole('group', { name: 'Calls' }, { timeout: 3000 });
  return input;
};

const highlightedLabel = () => document.querySelector('.command-palette-item.highlighted .command-palette-item-label').textContent;

// A page with its own input, the shortcuts, and the palette — the way TopBar
// wires them.
const Page = () => {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);
  useSearchShortcuts(openSearch, open);
  return (
    <>
      <input aria-label="Notes" />
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
};

describe('CommandPalette', () => {
  beforeEach(() => {
    navigate.mockReset();
    apiGet.mockReset();
    apiGet.mockImplementation(answerSearch);
  });

  it('opens on Ctrl+K and on / with the input focused', async () => {
    render(<Page />);
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('textbox', { name: 'Search' });
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull());

    // A slash typed into a field is the field's.
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    notes.focus();
    fireEvent.keyDown(notes, { key: '/' });
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();

    notes.blur();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(await screen.findByRole('textbox', { name: 'Search' })).toHaveFocus();
  });

  it('groups results by type and bolds the match', async () => {
    render(<CommandPalette open onClose={vi.fn()} />);
    await typeQuery('054');

    const calls = screen.getByRole('group', { name: 'Calls' });
    expect(within(calls).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '0541234567200', '0549999999201', 'See all 12 in Calls →',
    ]);
    expect(within(calls).getAllByText('054', { selector: 'b' })).toHaveLength(2);

    const devices = screen.getByRole('group', { name: 'Devices' });
    expect(within(devices).getByText('054', { selector: 'b' })).toBeInTheDocument();
    // Quick actions first, then the resources in type order; nothing in
    // Navigation or Recent matches "054", so those groups are absent.
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Quick actions', 'Calls', 'Devices']);
    // Type chips, with All first.
    expect(screen.getAllByRole('tab').slice(0, 3).map((c) => c.textContent)).toEqual(['All', 'Calls', 'Devices']);
    expect(apiGet.mock.calls.some(([url]) => url === '/api/calls?search[inline]=054&per_page=5')).toBe(true);
  });

  it('Enter on a Calls result or "See all" navigates to /calls?search[inline]=…', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const input = await typeQuery('054');

    // Quick actions: Ask, Call. Then the first call.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(highlightedLabel()).toBe('0541234567');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(decodeURIComponent(navigate.mock.calls[0][0])).toBe('/calls?search[inline]=054');
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByText('See all 12 in Calls →'));
    expect(decodeURIComponent(navigate.mock.calls[1][0])).toBe('/calls?search[inline]=054');
  });

  it('arrow keys move the highlight across groups; Esc closes', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const input = await typeQuery('054');

    expect(highlightedLabel()).toBe('Ask: “054”');
    for (let i = 0; i < 4; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(highlightedLabel()).toBe('See all 12 in Calls →');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(highlightedLabel()).toBe('Desk 054');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(highlightedLabel()).toBe('See all 12 in Calls →');

    // Tab cycles the type chips without leaving the input.
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the Ask row shows the assistant with the typed question', async () => {
    render(<CommandPalette open onClose={vi.fn()} />);
    const input = await typeQuery('how many calls today');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByTestId('ai-chat')).toHaveTextContent('how many calls today');
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to search' }));
    expect(await screen.findByRole('textbox', { name: 'Search' })).toHaveValue('how many calls today');
  });
});
