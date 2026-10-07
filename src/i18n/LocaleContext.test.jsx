import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Box, Button } from '@mui/material';
import { LocaleProvider, useLocale } from './LocaleContext';

let locale;
const Probe = () => {
  locale = useLocale();
  return null;
};

const renderWithLocale = (children = null) =>
  render(<LocaleProvider><Probe />{children}</LocaleProvider>);

// All CSS Emotion has inserted so far, from every <style> tag.
const insertedCss = () =>
  [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('\n');

beforeEach(() => {
  localStorage.clear();
});

describe('LocaleProvider', () => {
  it('starts in English, left to right', () => {
    renderWithLocale();
    expect(locale.language).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches to Hebrew, right to left, and remembers it was picked by hand', () => {
    renderWithLocale();
    act(() => locale.setLanguage('he'));
    expect(locale.isRtl).toBe(true);
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('app-language')).toBe('he');
    expect(localStorage.getItem('app-language-source')).toBe('user');
  });

  // Context values alone don't prove the app renders: a broken style cache
  // still passes those. Render real styled MUI components in both directions.
  it('renders styled MUI components in both directions', () => {
    renderWithLocale(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    act(() => locale.setLanguage('he'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('mirrors styles when right to left', () => {
    localStorage.setItem('app-language', 'he');
    renderWithLocale(<Box sx={{ marginLeft: '13px' }}>Mirrored</Box>);
    expect(screen.getByText('Mirrored')).toBeInTheDocument();
    expect(insertedCss()).toContain('margin-right:13px');
  });
});
