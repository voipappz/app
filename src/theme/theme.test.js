import { describe, it, expect } from 'vitest';
import theme, { createAppTheme } from './theme';
import { breakpoints } from './tokens';

describe('theme', () => {
  // The shell's CSS switches to the phone layout at max-width: 899px.
  it('puts md at 900px, where the shell CSS switches layout', () => {
    expect(theme.breakpoints.values).toEqual(breakpoints);
    expect(theme.breakpoints.values.md).toBe(900);
  });

  it('keeps light and dark schemes as CSS variables', () => {
    expect(Object.keys(theme.colorSchemes)).toEqual(['light', 'dark']);
    expect(theme.vars).toBeDefined();
  });

  // Built fresh per direction: spreading a built theme would lose dark mode.
  it('builds a right-to-left theme that keeps both colour schemes', () => {
    const rtl = createAppTheme('rtl');
    expect(rtl.direction).toBe('rtl');
    expect(Object.keys(rtl.colorSchemes)).toEqual(['light', 'dark']);
    expect(rtl.vars).toBeDefined();
    expect(theme.direction).toBe('ltr');
  });
});
