import { describe, it, expect } from 'vitest';
import theme, { createAppTheme } from './theme';

/**
 * These guard the wiring, not the design.
 *
 * The theme is built by a factory so `direction` can vary (it is a top-level
 * createTheme option and cannot live inside `colorSchemes`). The hazard is
 * that a future edit rebuilds it as `createTheme({ ...theme, direction })`,
 * which silently drops the cssVariables/colorSchemes setup: dark mode stops
 * flipping, and nothing throws, because `theme.palette` still answers with
 * light values. That has already cost this codebase once.
 */
describe('createAppTheme', () => {
  it('defaults to ltr and builds rtl on request', () => {
    expect(theme.direction).toBe('ltr');
    expect(createAppTheme().direction).toBe('ltr');
    expect(createAppTheme('rtl').direction).toBe('rtl');
  });

  it('keeps CSS-variables mode keyed on data-theme, in both directions', () => {
    for (const t of [createAppTheme('ltr'), createAppTheme('rtl')]) {
      // `vars` only exists when cssVariables is on; the selector is what ties
      // MUI's palette to the attribute ThemeContext and index.html set.
      expect(t.vars).toBeDefined();
      expect(t.vars.palette).toBeDefined();
      // MUI has moved where it echoes this back; accept either shape, since
      // what matters is that it is still 'data-theme' and not MUI's default.
      const selector = t.colorSchemeSelector ?? t.cssVariables?.colorSchemeSelector;
      expect(selector).toBe('data-theme');
    }
  });

  it('keeps both colour schemes, in both directions', () => {
    for (const t of [createAppTheme('ltr'), createAppTheme('rtl')]) {
      expect(t.colorSchemes.light).toBeDefined();
      expect(t.colorSchemes.dark).toBeDefined();
      // The two must actually differ, or dark mode renders light.
      expect(t.colorSchemes.dark.palette.background.default)
        .not.toBe(t.colorSchemes.light.palette.background.default);
    }
  });

  it('resolves palette colours through var(--mui-palette-*), not literals', () => {
    // Every styleOverride reads colours via `theme.vars.palette` so they flip
    // with the attribute. If this regresses to a hex, dark mode goes half-dead.
    expect(theme.vars.palette.divider).toMatch(/^var\(--mui-palette-/);
  });

  it('carries the breakpoints the shell CSS hardcodes', () => {
    // Layout.css / Sidebar.css / TopBar.css cut over at 899px; `down('md')`
    // has to mean the same thing.
    expect(theme.breakpoints.values.md).toBe(900);
  });

  it('changes direction without changing anything else', () => {
    const ltr = createAppTheme('ltr');
    const rtl = createAppTheme('rtl');
    expect(rtl.shape.borderRadius).toBe(ltr.shape.borderRadius);
    expect(rtl.typography.fontFamily).toBe(ltr.typography.fontFamily);
    expect(rtl.breakpoints.values).toEqual(ltr.breakpoints.values);
  });
});
