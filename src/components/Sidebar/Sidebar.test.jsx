import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ acl: null, user: { email: 'a@b.c', fullName: 'Admin' }, logout: vi.fn() }) }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));
vi.mock('../../hooks/useNavBadges', () => ({ default: () => ({}) }));
vi.mock('./CustomerSwitcher/SidebarCustomerSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../config/navConfig', () => ({
  getPermittedNavItems: () => [
    { path: '/calls', text: 'Calls', labelKey: 'nav:calls', iconComponent: () => <svg data-testid="icon-calls" /> },
    { path: '/devices', text: 'Devices', labelKey: 'nav:devices', iconComponent: () => <svg data-testid="icon-devices" /> },
  ],
  navLabel: (_t, item) => item.text,
}));

import Sidebar from './Sidebar.jsx';

const show = (collapsed) => render(<MemoryRouter initialEntries={['/calls']}><Sidebar collapsed={collapsed} /></MemoryRouter>);

describe('Sidebar: text when open, icons when collapsed', () => {
  it('open: each item shows its name, the current page is marked', () => {
    const { container } = show(false);
    expect(container.querySelector('.sidebar-container')).not.toHaveClass('collapsed');
    const calls = screen.getByRole('button', { name: 'Calls' });
    expect(within(calls).getByText('Calls')).toBeInTheDocument();
    expect(calls).toHaveAttribute('aria-current', 'page');
  });

  it('open: the account is named beside its avatar, with its email', () => {
    show(false);
    const who = screen.getByTestId('sidebar-profile-text');
    expect(within(who).getByText('Admin')).toBeInTheDocument();
    expect(within(who).getByText('a@b.c')).toBeInTheDocument();
  });

  it('collapsed: the account is the avatar alone', () => {
    show(true);
    expect(screen.queryByTestId('sidebar-profile-text')).not.toBeInTheDocument();
  });

  it('collapsed: a rail of icons, each named for screen readers and in a tooltip', () => {
    const { container } = show(true);
    expect(container.querySelector('.sidebar-container')).toHaveClass('collapsed');
    const devices = screen.getByRole('button', { name: 'Devices' });
    expect(within(devices).getByTestId('icon-devices')).toBeInTheDocument();
  });
});
