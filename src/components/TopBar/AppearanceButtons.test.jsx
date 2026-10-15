import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const toggleTheme = vi.fn();
const setLanguage = vi.fn();
vi.mock('../../context/ThemeContext', () => ({ useThemeMode: () => ({ isDarkMode: false, toggleTheme }) }));
vi.mock('../../i18n/LocaleContext', () => ({ useLocale: () => ({ language: 'en', setLanguage }) }));

import AppearanceButtons from './AppearanceButtons.jsx';

describe('AppearanceButtons in the top bar', () => {
  it('switches to the other language and toggles dark mode', () => {
    render(<AppearanceButtons />);
    fireEvent.click(screen.getByTestId('topbar-language'));
    expect(setLanguage).toHaveBeenCalledWith('he');
    fireEvent.click(screen.getByTestId('topbar-theme'));
    expect(toggleTheme).toHaveBeenCalled();
  });
});
