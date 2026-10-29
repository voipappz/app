// CallDock — the phone, in reach from anywhere: an incoming call, the call in
// progress, and the phone's own button, always in the same corner. Above
// every page and dialog (Z.CALL), and never a modal itself: no
// backdrop, no focus trap, nothing takes focus, so a form being edited stays
// open and untouched while a call is answered, held or hung up.
//
// Each piece mounts its own Portal only while it shows: an open dialog makes
// MUI hide the page's other <body> children from screen readers, and a card
// that appears after the dialog opened is not among them, so it is announced.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Box, ButtonBase, IconButton, Paper, Portal, Tooltip, Typography } from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { useSoftphone } from '../../context/SoftphoneContext';
import { usePortalSidebar } from '../../context/PortalSidebarContext';
import { requestIncomingCallNotifications, useIncomingCallAlerts } from '../../lib/sip/useIncomingCallAlerts.js';
import { Z } from '../../utils/zIndex';
import { PopupLayer } from '../ui';
import Bdi from '../../i18n/Bdi';
import CallToast from './CallToast.jsx';
import { useCallTimer, useHold } from './callHooks';
import usePageCovered from './usePageCovered';
import { ACCENT, GREEN, MUTED, PANEL } from './panelTheme.js';

// The registration state, as a dot on the phone button.
const DOT = { registered: '#22c55e', registering: '#f59e0b', connecting: '#f59e0b', failed: '#ef4444' };
const CONTROL_SX = { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)', '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' } };

// The top slot: full width (16px gutters) on a phone, a 340px card at the
// top-end corner from `sm` up, below the device's status area.
function TopSlot({ children }) {
  return (
    <Portal>
      <PopupLayer layer={Z.CALL_POPUP}>
        <Box
          data-testid="call-dock-slot"
          sx={{
            position: 'fixed', zIndex: Z.CALL,
            top: 'calc(8px + env(safe-area-inset-top, 0px))',
            insetInlineEnd: 16, insetInlineStart: { xs: 16, sm: 'auto' }, width: { sm: 340 },
          }}
        >
          {children}
        </Box>
      </PopupLayer>
    </Portal>
  );
}

// The call in progress: who, how long, and the controls a call needs most.
// The keypad and transfer stay in the full phone ("Open phone").
function InCallBar({ call, onOpenPhone }) {
  const { t } = useTranslation('phone');
  const { muted, setMuted, hangup } = useSoftphone();
  const hold = useHold();
  const timer = useCallTimer(call.state === 'active' ? call.connectedAt : null);
  const status = call.state === 'active' ? timer : call.state === 'ringing' ? t('call.ringing') : t('call.connecting');

  return (
    <Paper
      role="region" aria-label={t('dock.inCall')} data-testid="in-call-bar" elevation={8}
      // The controls stay beside the caller while both fit, and wrap under
      // it as one group on a very narrow screen.
      sx={{ bgcolor: PANEL, color: '#fff', borderRadius: 2, px: 1.5, py: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.75 }}
    >
      <Box sx={{ flex: '1 1 8rem', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: hold.held ? ACCENT : GREEN }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9rem' }}><Bdi>{call.remote}</Bdi></Typography>
          <Typography noWrap sx={{ fontSize: '0.75rem', color: MUTED }} data-testid="in-call-status">
            {hold.held ? t('dock.onHold') : <Bdi>{status}</Bdi>}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ms: 'auto' }}>
        <Tooltip title={muted ? t('dock.unmute') : t('dock.mute')}>
          <IconButton size="small" aria-label={muted ? t('dock.unmute') : t('dock.mute')} aria-pressed={muted}
            onClick={() => setMuted(!muted)} sx={{ ...CONTROL_SX, color: muted ? '#ef4444' : '#fff' }}>
            {muted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={hold.held ? t('call.resume') : t('call.hold')}>
          <span>
            <IconButton size="small" aria-label={hold.held ? t('call.resume') : t('call.hold')} aria-pressed={hold.held}
              disabled={hold.disabled} onClick={hold.toggle} sx={{ ...CONTROL_SX, color: hold.held ? ACCENT : '#fff' }}>
              {hold.held ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('dock.openPhone')}>
          <IconButton size="small" aria-label={t('dock.openPhone')} onClick={onOpenPhone} sx={CONTROL_SX}>
            <OpenInFullIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('call.hangUp')}>
          <IconButton size="small" aria-label={t('call.hangUp')} onClick={() => hangup()}
            sx={{ color: '#fff', bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}>
            <CallEndIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
}

// The phone's one home: a round button at the bottom-end corner, on every
// page and above every dialog, so it is always in the same place. Below `md`
// a covering dialog is full screen with its Save bar at the bottom, so there
// the button rises above that bar. The dot is the registration state; the
// button pulses green while a call is ringing.
// It is there before any dialog opens, so under one MUI hides it from screen
// readers with the rest of the page; the dialog keeps the keyboard inside it
// anyway, so there it is for the mouse and touch.
function PhoneLauncher({ status, ringing, lifted, onOpen }) {
  const { t } = useTranslation('phone');
  const label = ringing ? t('dock.ringing') : t('dock.openPhone');
  return (
    <Portal>
      <PopupLayer layer={Z.CALL_POPUP}>
        <Tooltip title={label} placement="top">
          <ButtonBase
            aria-label={label} data-testid="phone-launcher" data-lifted={lifted || undefined} onClick={onOpen}
            sx={{
              position: 'fixed', zIndex: Z.CALL, insetInlineEnd: { xs: 16, md: 24 },
              bottom: {
                xs: `calc(${lifted ? 88 : 16}px + env(safe-area-inset-bottom, 0px))`,
                md: 24,
              },
              width: 52, height: 52, borderRadius: '50%',
              bgcolor: ringing ? GREEN : PANEL, color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
              transition: 'bottom 150ms ease-out',
              '&:hover': { filter: 'brightness(1.1)' },
              '@keyframes phoneLauncherPulse': { '0%, 100%': { boxShadow: '0 0 0 0 rgba(52,199,89,0.6)' }, '50%': { boxShadow: '0 0 0 12px rgba(52,199,89,0)' } },
              animation: ringing ? 'phoneLauncherPulse 1.2s ease-in-out infinite' : 'none',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' },
            }}
          >
            <Badge overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              badgeContent={<Box sx={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid', borderColor: PANEL, bgcolor: DOT[status] || MUTED }} />}>
              <CallIcon />
            </Badge>
          </ButtonBase>
        </Tooltip>
      </PopupLayer>
    </Portal>
  );
}

export default function CallDock() {
  const { t } = useTranslation('phone');
  const { status, call, answer, hangup } = useSoftphone();
  const { view, open } = usePortalSidebar();
  const pageCovered = usePageCovered();

  // The ringtone and the hidden-tab notification, wherever the user is.
  useEffect(() => { void requestIncomingCallNotifications(); }, []);
  useIncomingCallAlerts(call);

  const ringing = Boolean(call) && call.direction === 'inbound' && call.state === 'ringing';
  const inCall = Boolean(call) && call.state !== 'ended' && !ringing;
  const openPhone = () => open('phone');

  return (
    <>
      {ringing && (
        <TopSlot>
          <CallToast open title={t('call.incomingTitle')} number={call.remote}
            onAnswer={() => answer()} onReject={() => hangup()} onClose={() => hangup()} />
        </TopSlot>
      )}
      {/* The phone itself shows the call while it is open. */}
      {inCall && view !== 'phone' && (
        <TopSlot><InCallBar call={call} onOpenPhone={openPhone} /></TopSlot>
      )}
      {/* Always there, except while the phone itself is open. */}
      {!view && <PhoneLauncher status={status} ringing={ringing} lifted={pageCovered} onOpen={openPhone} />}
    </>
  );
}
