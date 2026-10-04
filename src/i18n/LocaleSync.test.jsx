import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// vi.hoisted so the factories below can reach these; a plain `let` would be
// read before initialisation, since vi.mock is hoisted above the imports.
const mocks = vi.hoisted(() => ({
  admin: { isAuthenticated: false },
  user: { isAuthenticated: false },
  customer: { language: 'he' },
  loadCustomerData: null,
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.admin }));
vi.mock('../context/UserAuthContext', () => ({ useUserAuth: () => mocks.user }));
vi.mock('../services/customerService', () => ({
  loadCustomerData: (...args) => mocks.loadCustomerData(...args),
}));

const { LocaleProvider, useLocale, LANGUAGE_STORAGE_KEY, LANGUAGE_SOURCE_KEY } =
  await import('./LocaleContext');
const { default: LocaleSync } = await import('./LocaleSync');
const { default: i18n } = await import('./index');

const Probe = () => {
  const { language } = useLocale();
  return <span data-testid="lang">{language}</span>;
};

const lang = () => screen.getByTestId('lang').textContent;

/** Renders the provider with the sync leaf inside it, and lets effects settle. */
const mount = async () => {
  const result = render(
    <LocaleProvider>
      <LocaleSync />
      <Probe />
    </LocaleProvider>
  );
  // LocaleSync resolves a promise before calling setLanguage.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return result;
};

describe('LocaleSync — language precedence', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.admin = { isAuthenticated: false };
    mocks.user = { isAuthenticated: false };
    mocks.customer = { language: 'he' };
    mocks.loadCustomerData = vi.fn(() => Promise.resolve(mocks.customer));
  });

  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('does nothing while nobody is signed in', async () => {
    await mount();
    expect(lang()).toBe('en');
    expect(mocks.loadCustomerData).not.toHaveBeenCalled();
  });

  it('applies the customer default for an admin session', async () => {
    mocks.admin = { isAuthenticated: true };
    await mount();
    expect(lang()).toBe('he');
  });

  it('applies the customer default for a portal session', async () => {
    mocks.user = { isAuthenticated: true };
    await mount();
    expect(lang()).toBe('he');
  });

  it('marks a customer-applied value as overridable, not chosen', async () => {
    mocks.admin = { isAuthenticated: true };
    await mount();
    // So a later tenant change can still move it.
    expect(localStorage.getItem(LANGUAGE_SOURCE_KEY)).toBe('customer');
  });

  it('NEVER overrides an explicit choice — the rule that matters', async () => {
    // Someone who picked English on a Hebrew tenant keeps English, on every
    // login, forever.
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    localStorage.setItem(LANGUAGE_SOURCE_KEY, 'user');
    mocks.admin = { isAuthenticated: true };

    await mount();

    expect(lang()).toBe('en');
    expect(mocks.loadCustomerData).not.toHaveBeenCalled();
  });

  it('still applies the tenant over a previously inherited value', async () => {
    // Inherited, not chosen — so a tenant that switches default propagates.
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    localStorage.setItem(LANGUAGE_SOURCE_KEY, 'customer');
    mocks.admin = { isAuthenticated: true };

    await mount();

    expect(lang()).toBe('he');
  });

  it('falls back to English when the customer has no language', async () => {
    mocks.customer = { name: 'Acme' };
    mocks.admin = { isAuthenticated: true };
    await mount();
    expect(lang()).toBe('en');
  });

  it('normalizes a regional tenant value', async () => {
    mocks.customer = { language: 'he-IL' };
    mocks.admin = { isAuthenticated: true };
    await mount();
    expect(lang()).toBe('he');
  });

  it('ignores a tenant language we do not ship', async () => {
    mocks.customer = { language: 'ar' };
    mocks.admin = { isAuthenticated: true };
    await mount();
    expect(lang()).toBe('en');
  });

  it('survives the branding lookup failing', async () => {
    // A branding lookup must never block the app.
    mocks.loadCustomerData = vi.fn(() => Promise.reject(new Error('offline')));
    mocks.admin = { isAuthenticated: true };
    await mount();
    expect(lang()).toBe('en');
  });

  it('asks the customer only once per session', async () => {
    mocks.admin = { isAuthenticated: true };
    const { rerender } = await mount();
    rerender(
      <LocaleProvider>
        <LocaleSync />
        <Probe />
      </LocaleProvider>
    );
    await act(async () => { await Promise.resolve(); });
    // Re-applying would stamp on a choice made mid-session.
    expect(mocks.loadCustomerData).toHaveBeenCalledTimes(1);
  });
});
