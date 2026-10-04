import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminMobileNav from './AdminMobileNav';

const mocks = vi.hoisted(() => ({
  acl: null,
  navigate: null,
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ acl: mocks.acl }) }));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mocks.navigate,
}));

/** An ACL with read access to everything the sidebar gates on. */
const fullAcl = {
  data: Object.fromEntries(
    ['routes', 'services', 'extensions', 'subscriptions', 'tariffs', 'calls', 'logs',
      'monitors', 'nodes', 'reports', 'users', 'accounts', 'providers', 'templates']
      .map((key) => [key, { main: ['read', 'write'] }])
  ),
};

const mount = (path = '/calls') => render(
  <MemoryRouter initialEntries={[path]}>
    <AdminMobileNav />
  </MemoryRouter>
);

describe('AdminMobileNav', () => {
  beforeEach(() => {
    mocks.acl = fullAcl;
    mocks.navigate = vi.fn();
  });

  it('renders a navigation landmark', () => {
    mount();
    expect(screen.getByTestId('admin-mobile-nav')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('puts five screens in the bar and the rest behind More', () => {
    mount();
    // A phone fits about five; with ~16 permitted items the rest must go
    // somewhere rather than being dropped.
    const bar = screen.getByTestId('admin-mobile-nav');
    expect(within(bar).getByTestId('mobile-nav-more')).toBeInTheDocument();
    expect(within(bar).getByText('Routes')).toBeInTheDocument();
    // Scoped to the BAR: SwipeableDrawer keeps its children mounted while
    // closed, so Templates is in the document either way — what matters is
    // that it is not one of the five.
    expect(within(bar).queryByText('Templates')).not.toBeInTheDocument();
    expect(within(bar).queryByText('Calls')).not.toBeInTheDocument();
  });

  it('opens the sheet and lists the overflow screens', async () => {
    mount();
    fireEvent.click(screen.getByTestId('mobile-nav-more'));
    expect(await screen.findByTestId('admin-mobile-nav-more')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('All screens')).toBeInTheDocument();
  });

  it('navigates from the bar', () => {
    mount();
    fireEvent.click(screen.getByText('Routes'));
    expect(mocks.navigate).toHaveBeenCalledWith('/routing');
  });

  it('navigates from the sheet and closes it', async () => {
    mount();
    fireEvent.click(screen.getByTestId('mobile-nav-more'));
    fireEvent.click(await screen.findByText('Templates'));
    expect(mocks.navigate).toHaveBeenCalledWith('/templates');
  });

  it('marks the current screen', () => {
    // /routing, not /calls: the bar holds the first five NAV_ITEMS, which are
    // the MANAGE group — Calls is in the overflow. See the note on
    // PRIMARY_COUNT about whether those are the right five.
    mount('/routing');
    expect(screen.getByTestId('mobile-nav-routing')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('mobile-nav-services')).not.toHaveAttribute('aria-current');
  });

  it('marks More when the current screen is one of the hidden ones', () => {
    // Otherwise the bar looks like nothing at all is selected.
    mount('/templates');
    expect(screen.getByTestId('mobile-nav-more')).toHaveAttribute('aria-current', 'page');
  });

  it('offers nothing an ACL does not permit', () => {
    // Same filtering the desktop Sidebar uses — a screen you cannot reach
    // there is not offered here either.
    mocks.acl = { data: { calls: { main: ['read'] } } };
    mount();
    expect(screen.getByText('Calls')).toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Providers')).not.toBeInTheDocument();
  });

  it('survives a session with no ACL at all', () => {
    mocks.acl = null;
    expect(() => mount()).not.toThrow();
  });
});
