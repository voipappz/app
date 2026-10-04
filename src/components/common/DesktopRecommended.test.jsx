import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../theme/theme';
import DesktopRecommended from './DesktopRecommended';

const theme = createAppTheme('ltr');

const setViewport = (width) => {
  window.matchMedia = vi.fn().mockImplementation((query) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const matches = (!max || width <= parseFloat(max[1])) && (!min || width >= parseFloat(min[1]));
    return {
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  });
};

const mount = (props) => render(
  <ThemeProvider theme={theme}><DesktopRecommended {...props} /></ThemeProvider>
);

describe('DesktopRecommended', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('says so on a phone', () => {
    setViewport(375);
    mount();
    expect(screen.getByTestId('desktop-recommended')).toBeInTheDocument();
    expect(screen.getByText(/larger display/i)).toBeInTheDocument();
  });

  it('renders nothing on a desktop', () => {
    setViewport(1280);
    mount();
    expect(screen.queryByTestId('desktop-recommended')).not.toBeInTheDocument();
  });

  it('takes a caller-supplied message', () => {
    setViewport(375);
    mount({ message: 'Use a bigger screen for this.' });
    expect(screen.getByText('Use a bigger screen for this.')).toBeInTheDocument();
  });

  it('honours a custom breakpoint', () => {
    // 800 is above sm, below md.
    setViewport(800);
    mount({ breakpoint: 'sm' });
    expect(screen.queryByTestId('desktop-recommended')).not.toBeInTheDocument();
  });

  it('is informational, not an error', () => {
    // The canvas still works for reading a flow; this is advice, not a failure.
    setViewport(375);
    mount();
    expect(screen.getByTestId('desktop-recommended')).toHaveClass('MuiAlert-colorInfo');
  });
});
