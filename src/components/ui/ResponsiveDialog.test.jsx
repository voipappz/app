import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import ResponsiveDialog from './ResponsiveDialog';
import { createAppTheme } from '../../theme/theme';

// useMediaQuery's callback form is handed the theme from context, and MUI v7
// passes null when there is no provider rather than falling back to a default.
// The real app always renders this inside LocaleProvider's MuiThemeProvider,
// so wrapping here is the faithful setup, not a workaround.
const theme = createAppTheme('ltr');
const renderDialog = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

/**
 * jsdom has no layout, so useMediaQuery answers from window.matchMedia — which
 * jsdom does not implement. Stub it so a query is "matching" when the width it
 * asks about contains our pretend viewport.
 */
const setViewport = (width) => {
  window.matchMedia = vi.fn().mockImplementation((query) => {
    // MUI's down('sm') emits "(max-width:599.95px)"
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const matches = (!max || width <= parseFloat(max[1])) && (!min || width >= parseFloat(min[1]));
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
};

/** MUI sets this class on the paper only when fullScreen is on. */
const isFullScreen = () =>
  Boolean(document.querySelector('.MuiDialog-paperFullScreen'));

describe('ResponsiveDialog', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('is full-screen on a phone', () => {
    setViewport(375);
    renderDialog(<ResponsiveDialog open><p>body</p></ResponsiveDialog>);
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(isFullScreen()).toBe(true);
  });

  it('is a normal dialog on a tablet and up', () => {
    // A tablet has room, and full-screening there loses the context behind it.
    setViewport(900);
    renderDialog(<ResponsiveDialog open><p>body</p></ResponsiveDialog>);
    expect(isFullScreen()).toBe(false);
  });

  it('lets an explicit fullScreen win, either way', () => {
    setViewport(375);
    const { unmount } = renderDialog(
      <ResponsiveDialog open fullScreen={false}><p>a</p></ResponsiveDialog>
    );
    expect(isFullScreen()).toBe(false);
    unmount();

    setViewport(1280);
    renderDialog(<ResponsiveDialog open fullScreen><p>b</p></ResponsiveDialog>);
    expect(isFullScreen()).toBe(true);
  });

  it('honours a custom breakpoint', () => {
    // 800px sits between the breakpoints: above sm (600) so the default would
    // NOT full-screen it, below md (900) so fullScreenBreakpoint="md" does.
    // Note 900 itself would not work here — down('md') is max-width 899.95px,
    // so 900 IS md rather than below it.
    setViewport(800);
    renderDialog(
      <ResponsiveDialog open fullScreenBreakpoint="md"><p>body</p></ResponsiveDialog>
    );
    expect(isFullScreen()).toBe(true);
  });

  it('passes the rest through, so it is a drop-in', () => {
    setViewport(1280);
    renderDialog(
      <ResponsiveDialog open data-testid="dlg" aria-label="Edit thing">
        <p>body</p>
      </ResponsiveDialog>
    );
    expect(screen.getByTestId('dlg')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit thing')).toBeInTheDocument();
  });
});
