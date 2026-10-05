import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import PortalHeader from './PortalHeader';

vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ user: { name: 'Alex' }, acl: { dashboard: ['read'], call: ['read'] }, logout: vi.fn() }) }));
vi.mock('../../context/PortalPreferencesContext', () => ({ usePortalPreferences: () => ({ preferences: { theme: 'light' }, ready: true, save: vi.fn(), reset: vi.fn() }) }));
vi.mock('../../context/AIChatSidebarContext', () => ({ useAIChatSidebar: () => ({ openAIDrawer: vi.fn() }) }));
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ connected: true }) }));
// The header gained the portal's language toggle, and useLocale throws outside
// its provider. Mocked rather than wrapped, to match the other four above.
vi.mock('../../i18n/LocaleContext', () => ({ useLocale: () => ({ language: 'en', setLanguage: vi.fn() }) }));
function CurrentRoute() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output>; }

describe('Portal header', () => {
  it('keeps search visible and opens Calls with wildcard text intact', () => {
    render(<MemoryRouter><PortalHeader /><CurrentRoute /></MemoryRouter>);
    const search = screen.getByRole('textbox', { name: 'Search calls' });
    fireEvent.change(search, { target: { value: '050%123' } });
    fireEvent.submit(search.closest('form'));
    expect(screen.getByTestId('route')).toHaveTextContent('/my-calls?q=050%25123');
    expect(screen.getByRole('navigation', { name: 'Portal navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(screen.getByTestId('route')).not.toHaveTextContent('q=');
  });
});
