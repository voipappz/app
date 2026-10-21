import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// The three sizes a screen lays itself out for, so screens agree on where a
// phone ends and a desktop begins:
//   phone    below sm (600px)    one column, cards, full-screen dialogs
//   tablet   sm up to lg (1200px) a table with fewer columns; side panels
//                                 open over the list instead of beside it
//   desktop  lg and up           everything side by side
export default function useLayoutSize() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const isBelowDesktop = useMediaQuery(theme.breakpoints.down('lg'));
  if (isPhone) return 'phone';
  return isBelowDesktop ? 'tablet' : 'desktop';
}
