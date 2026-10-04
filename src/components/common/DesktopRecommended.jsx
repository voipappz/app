import Alert from '@mui/material/Alert';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslation } from 'react-i18next';

/**
 * DesktopRecommended — says so, rather than letting someone fight a screen
 * that was never going to work on their phone.
 *
 * For the node-graph editors (PBXRouting, Workflows). They are React Flow
 * canvases: you drag nodes, draw edges between them and read a whole call flow
 * at once. None of that survives a 375px viewport, and making it genuinely
 * touch-friendly is a redesign rather than a responsive pass — explicitly out
 * of scope for this work.
 *
 * So the canvas stays as it is and this is honest about it. A notice someone
 * can read and act on (turn the phone, or come back at a desk) is better than
 * a canvas that technically renders and cannot be used, and far better than
 * blocking the screen outright: viewing a flow you already built is still
 * worth something on a phone.
 *
 * Renders nothing above the breakpoint.
 */
const DesktopRecommended = ({ breakpoint = 'md', message, sx }) => {
  // Both hooks run unconditionally, before any early return.
  const { t } = useTranslation();
  const isNarrow = useMediaQuery((theme) => theme.breakpoints.down(breakpoint));

  if (!isNarrow) return null;

  return (
    <Alert severity="info" data-testid="desktop-recommended" sx={{ m: 1, ...sx }}>
      {message ?? t('common:state.desktopRecommended', {
        defaultValue: 'This screen is designed for a larger display. You can pan and zoom here, but editing a flow is much easier on a desktop.',
      })}
    </Alert>
  );
};

export default DesktopRecommended;
