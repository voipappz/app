import { useTranslation } from 'react-i18next';
import { Box, Drawer, IconButton, Tooltip, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { usePortalSidebar } from '../../context/PortalSidebarContext';
import PhoneScreen from '../Phone/PhoneScreen.jsx';
import CallDetailPanel from '../Calls/CallDetailPanel/CallDetailPanel.jsx';

/**
 * The one sidebar, open on the right — in the portal and the account console.
 *
 * The phone opens here, and so does a call's details — same drawer, same edge,
 * so there is one place on the screen where things appear. Right, because the
 * phone's button is at the right end of the bar: a drawer opens from the side
 * its control lives on.
 *
 * Full width below `sm`: 380px beside a 360px screen leaves a useless sliver.
 */
export const SIDEBAR_WIDTH = 380;

export default function PortalSidebar() {
  const { t } = useTranslation('phone');
  const isRtl = useTheme().direction === 'rtl';
  const { view, params, close } = usePortalSidebar();
  const showingCall = view === 'call';

  // Escape is the Drawer's own (onClose). A window-level handler here also
  // closed the drawer out from under a child that was handling Escape itself —
  // the transfer field, the line's own list.

  return (
    <Drawer
      anchor={isRtl ? 'left' : 'right'} open={Boolean(view)} onClose={close} data-testid="portal-sidebar" keepMounted
      PaperProps={{ sx: { width: { xs: '100vw', sm: SIDEBAR_WIDTH }, maxWidth: '100vw', border: 'none', display: 'flex', flexDirection: 'column' } }}
    >
      {/* The phone stays MOUNTED while a call's details are showing, and is
          hidden instead: unmounting it threw away a half-typed number, an
          open transfer and the settings form — and would drop an in-progress
          call's UI state the moment someone clicked a row. The phone draws its
          own header (avatar, extension, registration); the detail view brings
          its own close button, so only the phone needs the strip above it. */}
      <Box sx={{ display: showingCall ? 'none' : 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, py: 0.5, bgcolor: '#2f3640' }}>
          <Tooltip title={t('action.close')}>
            <IconButton size="small" onClick={close} data-testid="sidebar-close" sx={{ color: '#9aa6b6' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <PhoneScreen embedded initialTab={params?.tab} initialNumber={params?.number} device={params?.device} />
        </Box>
      </Box>

      {showingCall && (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', '& .call-detail-panel': { width: '100%' } }}>
          <CallDetailPanel call={params?.call} onClose={close} onOpenRecording={params?.onOpenRecording} onCallBack={params?.onCallBack} isMobile={false} />
        </Box>
      )}
    </Drawer>
  );
}
