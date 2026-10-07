import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from './LocaleContext';
import LanguageLink from './LanguageLink';

beforeEach(() => localStorage.clear());

describe('LanguageLink', () => {
  it('names the other language and switches to it, as a choice made by hand', () => {
    render(<LocaleProvider><LanguageLink /></LocaleProvider>);
    fireEvent.click(screen.getByText('עברית'));

    expect(screen.getByText('English')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('app-language-source')).toBe('user');
  });

  it('renders nothing outside the app providers', () => {
    const { container } = render(<LanguageLink />);
    expect(container).toBeEmptyDOMElement();
  });
});
