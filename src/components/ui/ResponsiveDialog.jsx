import Dialog from '@mui/material/Dialog';
import useMediaQuery from '@mui/material/useMediaQuery';

/**
 * ResponsiveDialog — a Dialog that goes full-screen on a phone.
 *
 * A drop-in for MUI's Dialog. The intended adoption is an import swap, so a
 * screen keeps the markup it already has:
 *
 *   import { ResponsiveDialog as Dialog } from '../ui';
 *
 * Why a component rather than a theme default: `fullScreen` has to be computed
 * from the viewport, and `useMediaQuery` is a hook — it cannot live in
 * `components.MuiDialog.defaultProps`. Everything else about dialogs IS set in
 * the theme (src/theme/theme.js sets fullWidth and maxWidth there).
 *
 * Of ~80 dialogs in the app, five did this by hand; the rest shrink to the
 * viewport and then their contents overflow, because dialog bodies are full of
 * side-by-side TextFields with fixed widths. Going full-screen does not fix
 * that overflow by itself — it gives the content the room to be fixed.
 *
 * `fullScreen` passed explicitly always wins, so a dialog that must never go
 * full-screen (or must always) can still say so.
 */
const ResponsiveDialog = ({ fullScreen, fullScreenBreakpoint = 'sm', ...props }) => {
  // `down('sm')` is below 600px: phones, not tablets. A tablet has room for a
  // normal dialog, and full-screening there loses the context behind it.
  const autoFullScreen = useMediaQuery((theme) => theme.breakpoints.down(fullScreenBreakpoint));

  return <Dialog fullScreen={fullScreen ?? autoFullScreen} {...props} />;
};

export default ResponsiveDialog;
