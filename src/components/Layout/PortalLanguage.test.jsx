import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

/**
 * The portal's language toggle.
 *
 * It exists because the switcher was originally built only in Settings →
 * Appearance, and Settings is an admin screen — so a portal user had no way to
 * change language at all, on the surface where Hebrew matters most. This pins
 * that it is reachable from the account menu and that it records an explicit
 * choice.
 */
const mocks = vi.hoisted(() => ({ language: 'en', setLanguage: null }));

vi.mock('../../context/UserAuthContext', () => ({
  useUserAuth: () => ({ user: { name: 'Alex' }, acl: { dashboard: ['read'], call: ['read'] }, logout: vi.fn() }),
}));
vi.mock('../../context/PortalPreferencesContext', () => ({
  usePortalPreferences: () => ({ preferences: { theme: 'light' }, ready: true, save: vi.fn(), reset: vi.fn() }),
}));
vi.mock('../../context/AIChatSidebarContext', () => ({ useAIChatSidebar: () => ({ openAIDrawer: vi.fn() }) }));
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ connected: true }) }));
vi.mock('../../i18n/LocaleContext', () => ({
  useLocale: () => ({ language: mocks.language, setLanguage: mocks.setLanguage }),
}));

const { default: PortalHeader } = await import('./PortalHeader.jsx');

const openAccountMenu = () => {
  render(<MemoryRouter><PortalHeader /></MemoryRouter>);
  fireEvent.click(screen.getByLabelText('Your account and preferences'));
};

describe('portal language toggle', () => {
  beforeEach(() => {
    mocks.language = 'en';
    mocks.setLanguage = vi.fn();
  });

  it('is in the account menu', () => {
    openAccountMenu();
    expect(screen.getByTestId('portal-language-toggle')).toBeInTheDocument();
  });

  it('offers Hebrew, named in Hebrew, when English is active', () => {
    // A reader looking for Hebrew should not have to recognise "Hebrew".
    openAccountMenu();
    expect(screen.getByTestId('portal-language-toggle')).toHaveTextContent('עברית');
  });

  it('offers English when Hebrew is active', () => {
    mocks.language = 'he';
    openAccountMenu();
    expect(screen.getByTestId('portal-language-toggle')).toHaveTextContent('English');
  });

  it('records the switch as the user\'s own choice', () => {
    // 'user' is what outranks the customer default from then on (LocaleSync).
    openAccountMenu();
    fireEvent.click(screen.getByTestId('portal-language-toggle'));
    expect(mocks.setLanguage).toHaveBeenCalledWith('he', 'user');
  });

  it('switches back from Hebrew', () => {
    mocks.language = 'he';
    openAccountMenu();
    fireEvent.click(screen.getByTestId('portal-language-toggle'));
    expect(mocks.setLanguage).toHaveBeenCalledWith('en', 'user');
  });
});
