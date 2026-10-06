import { describe, it, expect } from 'vitest';
import theme from './theme';
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
});
