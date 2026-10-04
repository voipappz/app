import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LocaleProvider, LANGUAGE_STORAGE_KEY, LANGUAGE_SOURCE_KEY } from '../../i18n/LocaleContext';
import { ThemeProvider } from '../../context/ThemeContext';
import Appearance from './Appearance';
import i18n from '../../i18n';

const mount = () => render(
  <LocaleProvider>
    <ThemeProvider>
      <Appearance />
    </ThemeProvider>
  </LocaleProvider>
);

const pickLanguage = async (label) => {
  fireEvent.mouseDown(screen.getByTestId('appearance-language').querySelector('[role="combobox"]'));
  await act(async () => { fireEvent.click(await screen.findByRole('option', { name: label })); });
};

describe('Appearance', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
  });

  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('shows the current language, and names each one in its own language', () => {
    mount();
    // A reader looking for Hebrew should not have to recognise the English
    // word "Hebrew" to find it.
    expect(screen.getByTestId('appearance-language')).toHaveTextContent('English');
  });

  it('switches language, direction and storage together', async () => {
    mount();
    await pickLanguage('עברית');

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(i18n.language).toBe('he');
  });

  it('records the choice as the user\'s, so the tenant cannot override it', async () => {
    // This is what makes "I picked English on a Hebrew tenant" stick.
    mount();
    await pickLanguage('עברית');
    expect(localStorage.getItem(LANGUAGE_SOURCE_KEY)).toBe('user');
  });

  it('offers the theme toggle the admin console otherwise has no way to reach', () => {
    mount();
    const group = screen.getByTestId('appearance-theme');
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
  });

  it('switches theme and persists it', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(localStorage.getItem('theme-preference')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('renders its own labels in Hebrew once Hebrew is active', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'he');
    await act(async () => { await i18n.changeLanguage('he'); });
    mount();
    // getByLabelText, not getByText: MUI's outlined Select renders its label
    // twice — once as <label>, once as a <span> in the fieldset legend — so a
    // text query finds two. Asking for the field BY its label is also the
    // better assertion: it proves the label is actually associated with the
    // control, not merely present somewhere on the page.
    expect(screen.getByLabelText('שפה')).toBeInTheDocument();  // Language
    expect(screen.getByText('ערכת נושא')).toBeInTheDocument();  // Theme (a legend, rendered once)
  });
});
