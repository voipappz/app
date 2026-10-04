import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import { LocaleProvider, useLocale, LANGUAGE_STORAGE_KEY } from './LocaleContext';
import i18n from './index';

/** Reports what the provider resolved, including what MUI saw. */
const Probe = () => {
  const { language, direction, isRtl } = useLocale();
  const theme = useTheme();
  return (
    <div
      data-testid="probe"
      data-language={language}
      data-direction={direction}
      data-rtl={String(isRtl)}
      data-theme-direction={theme.direction}
    />
  );
};

const probe = () => screen.getByTestId('probe').dataset;

const renderProvider = () => render(<LocaleProvider><Probe /></LocaleProvider>);

describe('LocaleProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  afterEach(async () => {
    // i18next is a module singleton; leaving it on 'he' leaks into other files.
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('defaults to English and ltr with nothing stored', () => {
    renderProvider();
    expect(probe().language).toBe('en');
    expect(probe().direction).toBe('ltr');
    expect(probe().rtl).toBe('false');
  });

  it('does NOT follow the browser language', () => {
    // A Hebrew-locale browser must not silently get a Hebrew console; English
    // is the default until someone chooses otherwise.
    renderProvider();
    expect(probe().language).toBe('en');
  });

  it('restores a stored choice', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'he');
    renderProvider();
    expect(probe().language).toBe('he');
    expect(probe().direction).toBe('rtl');
    expect(probe().rtl).toBe('true');
  });

  it('normalizes a regional or unknown stored value', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'he-IL');
    renderProvider();
    expect(probe().language).toBe('he');
  });

  it('falls back to English on junk rather than throwing', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon');
    renderProvider();
    expect(probe().language).toBe('en');
  });

  it('hands the direction to the MUI theme', () => {
    // This is the wiring that makes MUI components mirror at all.
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'he');
    renderProvider();
    expect(probe().themeDirection).toBe('rtl');
  });

  it('sets dir and lang on <html>', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'he');
    renderProvider();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
  });

  it('switches language, direction and i18next together', async () => {
    const { rerender } = renderProvider();
    expect(probe().direction).toBe('ltr');

    // Drive it the way the switcher will.
    const Switch = () => {
      const { setLanguage } = useLocale();
      return <button onClick={() => setLanguage('he')}>he</button>;
    };
    rerender(<LocaleProvider><Probe /><Switch /></LocaleProvider>);
    await act(async () => { screen.getByText('he').click(); });

    expect(probe().language).toBe('he');
    expect(probe().direction).toBe('rtl');
    expect(probe().themeDirection).toBe('rtl');
    expect(i18n.language).toBe('he');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('he');
  });

  it('follows another tab through a storage event', async () => {
    renderProvider();
    expect(probe().language).toBe('en');

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: LANGUAGE_STORAGE_KEY,
        newValue: 'he',
      }));
    });

    expect(probe().language).toBe('he');
    expect(probe().direction).toBe('rtl');
  });

  it('ignores storage events for other keys', async () => {
    renderProvider();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'theme-preference',
        newValue: 'dark',
      }));
    });
    expect(probe().language).toBe('en');
  });

  /**
   * These two exist because the eleven above all passed while the app was
   * unusable. Probe renders a plain <div>, so Emotion never had to serialize
   * anything and the style pipeline was never exercised. A plugin taken from a
   * different stylis instance than the one Emotion runs internally crashes its
   * serializer, Emotion's <Insertion> throws on mount, the error boundary
   * recreates the tree, and the remount loop re-fires every request on screen.
   *
   * Rendering a STYLED MUI component is what forces insertion, so these fail
   * loudly on that mistake. One per cache, since each has its own plugin list.
   */
  it('inserts styles without crashing in ltr', () => {
    render(
      <LocaleProvider>
        <Button sx={{ marginInlineStart: 1, color: 'primary.main' }}>ok</Button>
      </LocaleProvider>
    );
    expect(screen.getByRole('button', { name: 'ok' })).toBeInTheDocument();
  });

  it('inserts styles without crashing in rtl', () => {
    // The RTL cache is the one that DOES pass stylisPlugins, so it is the half
    // that depends on stylis resolving to a single copy.
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'he');
    render(
      <LocaleProvider>
        <Button sx={{ marginInlineStart: 1, color: 'primary.main' }}>בסדר</Button>
      </LocaleProvider>
    );
    expect(screen.getByRole('button', { name: 'בסדר' })).toBeInTheDocument();
  });

  it('throws if used outside the provider', () => {
    // Silence React's error boundary noise for this one render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within LocaleProvider/);
    spy.mockRestore();
  });
});
