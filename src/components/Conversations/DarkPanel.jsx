import { useMemo } from 'react';
import { Box } from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';

// The room palette of the phone (PhoneScreen's call room), so the contact
// panel under the phone sits on the SAME dark surface: one continuous column.
export const ROOM = '#282c34';
export const ROOM_PAPER = '#2c2c34';
export const ROOM_FG = '#fdfdff';

export default function DarkPanel({ children, sx }) {
  const outer = useTheme();
  const theme = useMemo(() => createTheme({
    direction: outer.direction,
    palette: { mode: 'dark', background: { default: ROOM, paper: ROOM_PAPER }, text: { primary: ROOM_FG } },
  }), [outer.direction]);
  return (
    <ThemeProvider theme={theme}>
      <Box data-testid="dark-panel" sx={{ bgcolor: ROOM, color: ROOM_FG, ...sx }}>{children}</Box>
    </ThemeProvider>
  );
}
