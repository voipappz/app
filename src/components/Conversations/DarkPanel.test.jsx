import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import DarkPanel from './DarkPanel.jsx';

function Probe() {
  const theme = useTheme();
  return <div data-testid="probe" data-mode={theme.palette.mode} data-paper={theme.palette.background.paper} data-dir={theme.direction} />;
}

describe('DarkPanel', () => {
  it('gives its children the room palette, dark, in the page direction', () => {
    render(
      <ThemeProvider theme={createTheme({ direction: 'rtl', palette: { mode: 'light' } })}>
        <DarkPanel><Probe /></DarkPanel>
      </ThemeProvider>
    );
    const probe = screen.getByTestId('probe');
    expect(probe).toHaveAttribute('data-mode', 'dark');
    expect(probe).toHaveAttribute('data-paper', '#2c2c34');
    expect(probe).toHaveAttribute('data-dir', 'rtl');
    expect(screen.getByTestId('dark-panel')).toHaveStyle({ backgroundColor: 'rgb(40, 44, 52)' });
  });
});
