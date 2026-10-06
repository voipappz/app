import { Dialog, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// A Dialog that fills the screen on a phone, where a centred box would leave
// no room for its content. A screen switches over by changing one import:
//   import { ResponsiveDialog as Dialog } from '../ui';
// An explicit `fullScreen` prop still wins.
export default function ResponsiveDialog({ fullScreen, fullScreenBelow = 'sm', ...dialogProps }) {
  // useTheme falls back to MUI's default theme outside a ThemeProvider.
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down(fullScreenBelow));
  return <Dialog fullScreen={fullScreen ?? isSmallScreen} {...dialogProps} />;
}
