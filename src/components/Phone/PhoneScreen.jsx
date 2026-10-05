// PhoneScreen — the /phone route (see App.jsx's DualProtectedRoute): a
// full-page softphone, reachable from either the admin console or the user
// portal. Adapted from app's PhoneWidget.jsx (a header-triggered docked
// drawer) into a page layout, since here it's a dedicated route rather than
// an overlay. Core calling (dialpad, mute/hold/hangup/DTMF, transfer,
// settings) is ported; the presence/agent-status picker and the "Calls"
// history tab are not (they're admin-console-specific integrations, not part
// of the core WebRTC migration) — follow-up if wanted.
import { useEffect, useRef, useState } from 'react';
import {
  Box, IconButton, Tabs, Tab, TextField, Button, Typography, Stack, Tooltip, Avatar, Paper
} from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import BackspaceIcon from '@mui/icons-material/Backspace';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PhoneForwardedIcon from '@mui/icons-material/PhoneForwarded';
import DialpadIcon from '@mui/icons-material/Dialpad';
import SettingsIcon from '@mui/icons-material/Settings';
import TerminalIcon from '@mui/icons-material/Terminal';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import { useSoftphone } from '../../context/SoftphoneContext';
import { useUserAuth } from '../../context/UserAuthContext';
import SipSettingsForm from './SipSettingsForm.jsx';
import CallToast from './CallToast.jsx';
import TransferControls from './TransferControls.jsx';
import PhoneCallsTab from './PhoneCallsTab.jsx';
import Bdi from '../../i18n/Bdi.jsx';
import PhonePresence from './PhonePresence.jsx';
import { ACCENT, GREEN, MUTED, PANEL, PANEL_HEADER } from './panelTheme.js';
import { requestIncomingCallNotifications, useIncomingCallAlerts } from '../../lib/sip/useIncomingCallAlerts.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const DOT = { registered: '#22c55e', connecting: '#f59e0b', failed: '#ef4444', unregistered: '#94a3b8', idle: '#94a3b8', unavailable: '#ef4444' };
const LOG_COLOR = { error: '#f87171', warn: '#fbbf24', debug: '#94a3b8', log: '#cbd5e1' };

function useCallTimer(connectedAt) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!connectedAt) { setSecs(0); return; }
    const t0 = connectedAt;
    setSecs(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

// `embedded` = rendered inside PhoneDock's drawer rather than as the /phone
// page. The page wants a centred, padded card; the dock wants the panel to
// fill the drawer edge to edge, so the tabs sit on the bottom of the panel
// instead of floating above a band of empty white.
export default function PhoneScreen({ embedded = false }) {
  const {
    status, connected, call, muted, held, doNotDisturb, networkAvailable, lastError,
    dial, answer, hangup, sendDtmf, setMuted, setHeld, setDoNotDisturb,
    transfer, consult, settings, logs = [], clearLogs
  } = useSoftphone();

  const userAuth = useUserAuth();
  // Logout belongs to the portal user's session only — an admin viewing
  // /phone signs out through the admin console's own account menu.
  const isPortalUser = userAuth.isAuthenticated;

  const [tab, setTab] = useState(1); // 0 = Calls, 1 = Dialpad (default), 2 = Settings
  const [number, setNumber] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [dialError, setDialError] = useState(null);
  const logEndRef = useRef(null);

  useEffect(() => { void requestIncomingCallNotifications(); }, []);
  useEffect(() => { if (logsOpen) logEndRef.current?.scrollIntoView({ block: 'end' }); }, [logs, logsOpen]);

  const inCall = call && call.state !== 'ended';
  const incoming = call && call.direction === 'inbound' && call.state === 'ringing';
  // A live transfer owns the hold state and keeps the panel on screen.
  const transferBusy = Boolean(transfer) || Boolean(consult && consult.state !== 'ended');
  useIncomingCallAlerts(call);
  const timer = useCallTimer(call?.state === 'active' ? call.connectedAt : null);

  const ext = settings?.username || '—';
  const name = settings?.displayName || settings?.username || 'guest';
  const initial = (name?.trim()?.[0] || 'G').toUpperCase();
  const statusText = !networkAvailable
    ? 'Network offline'
    : connected
      ? 'Ready'
      : status === 'connecting' ? 'Connecting…'
        : status === 'unavailable' ? 'Unavailable'
          : 'Offline';

  const press = (k) => {
    if (call?.state === 'active') sendDtmf(k);
    else setNumber((n) => n + k);
  };
  // setHeld resolves only when the PBX answers the re-INVITE, so keep the button
  // disabled for the round trip rather than letting it flip and flip back.
  const toggleHold = async () => {
    setHoldPending(true);
    try { await setHeld(!held); } catch { /* surfaced via lastError */ }
    finally { setHoldPending(false); }
  };
  const startCall = async (target) => {
    const n = (target || number).trim();
    // Silence was the bug: an empty number or an unregistered phone returned
    // here with no feedback whatsoever, so the green button looked dead.
    if (!n) { setDialError('Enter a number to call'); return; }
    if (!connected) { setDialError('Phone is not registered'); return; }
    setDialError(null);
    try {
      await dial(n);
    } catch (error) {
      setDialError(error?.message || 'Call could not be started');
    }
  };

  return (
    <Box
      data-testid="phone-screen"
      sx={embedded
        ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }
        : { p: { xs: 2, md: 3 }, width: '100%', maxWidth: 480, mx: 'auto' }}
    >
      <Paper
        elevation={0}
        sx={{
          overflow: 'hidden', bgcolor: PANEL, color: '#e5e7eb',
          display: 'flex', flexDirection: 'column',
          ...(embedded ? { flex: 1, minHeight: 0, borderRadius: 0 } : { borderRadius: 3 })
        }}
      >
        {/* Header — avatar, name / ext, ready status */}
        <Box sx={{ bgcolor: PANEL_HEADER, px: 1.5, py: 1.25, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Avatar sx={{ width: 44, height: 44, bgcolor: '#5b6675', fontSize: '1.1rem' }}>{initial}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }} noWrap>
              {/* Bdi on the extension: a bare number beside Hebrew text drags
                  the bullet separator to the wrong side. */}
              {name} <Box component="span" sx={{ color: MUTED, fontWeight: 400 }}>• <Bdi>{ext}</Bdi></Box>
            </Typography>
            <PhonePresence
              userUuid={userAuth.user?.uuid}
              doNotDisturb={doNotDisturb}
              onDoNotDisturbChange={setDoNotDisturb}
            />
            <Typography sx={{ mt: 0.5, fontSize: '0.68rem', color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5 }} noWrap>
              <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: DOT[status] || '#94a3b8', display: 'inline-block' }} />
              {statusText}{settings?.domain ? ` • ${settings.domain}` : ''}
            </Typography>
            {lastError && (
              <Typography
                title={lastError}
                role="alert"
                sx={{
                  mt: 0.4, fontSize: '0.66rem', color: '#fca5a5', wordBreak: 'break-word',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}
              >
                {lastError}
              </Typography>
            )}
          </Box>
          <Tooltip title="Logs">
            <IconButton size="small" sx={{ color: logsOpen ? ACCENT : MUTED }} onClick={() => setLogsOpen((v) => !v)}><TerminalIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>

        {/* Body */}
        <Box sx={{ display: 'flex', flexDirection: 'column', ...(embedded ? { flex: 1, minHeight: 0, overflowY: 'auto' } : { minHeight: 360 }) }}>
          {logsOpen ? (
            <Box sx={{ p: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: MUTED }}>SIP.js logs ({logs.length})</Typography>
                <Button size="small" onClick={() => clearLogs?.()} disabled={!logs.length} sx={{ minWidth: 0, color: MUTED }}>Clear</Button>
              </Stack>
              <Box sx={{ flex: 1, maxHeight: 320, overflow: 'auto', bgcolor: '#0f172a', borderRadius: 1, p: 1, fontFamily: 'monospace', fontSize: '0.66rem', direction: 'ltr' }}>
                {logs.length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)' }}>No logs yet — connect or place a call.</Typography>
                ) : logs.map((l, i) => (
                  <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 0.25, color: LOG_COLOR[l.level] || '#cbd5e1' }}>
                    <span style={{ color: '#475569' }}>{new Date(l.ts).toLocaleTimeString()} </span>
                    <span style={{ color: 'var(--mui-palette-text-secondary)' }}>[{l.category}] </span>{l.content}
                  </Box>
                ))}
                <div ref={logEndRef} />
              </Box>
            </Box>
          ) : inCall ? (
            <Box sx={{ p: 2, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="overline" sx={{ color: MUTED }}>
                {call.direction === 'inbound' ? 'Incoming' : 'Calling'}
              </Typography>
              <Typography variant="h6" sx={{ direction: 'ltr', color: '#fff' }}>{call.remote}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: MUTED }}>
                {call.state === 'active' ? timer : call.state === 'ringing' ? 'Ringing…' : 'Connecting…'}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center">
                <IconButton onClick={() => setMuted(!muted)} sx={{ color: muted ? '#ef4444' : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
                <Tooltip title={held ? 'Resume' : 'Hold'}>
                  <span>
                    <IconButton
                      data-testid="phone-hold"
                      disabled={call.state !== 'active' || holdPending || transferBusy}
                      onClick={toggleHold}
                      sx={{ color: held ? ACCENT : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}
                    >
                      {held ? <PlayArrowIcon /> : <PauseIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Transfer">
                  <span>
                    <IconButton
                      data-testid="phone-transfer-open"
                      disabled={call.state !== 'active'}
                      onClick={() => setTransferOpen((v) => !v)}
                      sx={{ color: transferOpen || transferBusy ? ACCENT : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}
                    >
                      <PhoneForwardedIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              <TransferControls open={transferOpen} onClose={() => setTransferOpen(false)} callActive={call.state === 'active'} />
              {/* dir on the keypad only: 1-2-3 is a physical phone's layout, not
                  prose, so it does not mirror. The panel around it does. */}
              <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.5, mt: 2, mb: 2 }}>
                {KEYS.map((k) => <Button key={k} sx={{ color: '#cbd5e1', fontSize: '1.1rem' }} onClick={() => press(k)}>{k}</Button>)}
              </Box>
              <Button fullWidth variant="contained" color="error" startIcon={<CallEndIcon />} onClick={() => hangup()} sx={{ borderRadius: 2, py: 1.1 }}>
                Hang up
              </Button>
            </Box>
          ) : tab === 0 ? (
            <PhoneCallsTab active={!inCall && tab === 0} onDial={(n) => { setNumber(n); startCall(n); }} />
          ) : tab === 1 ? (
            <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ position: 'relative', mb: 2 }}>
                <TextField
                  fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)}
                  placeholder="Enter number"
                  inputProps={{ style: { direction: 'ltr', textAlign: 'center', fontSize: '1.25rem', color: 'var(--mui-palette-text-primary)' } }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1.5 } }}
                />
                {number && (
                  <IconButton size="small" onClick={() => setNumber((n) => n.slice(0, -1))} sx={{ position: 'absolute', insetInlineEnd: 4, top: '50%', transform: 'translateY(-50%)', color: 'var(--mui-palette-text-secondary)' }}>
                    <BackspaceIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', rowGap: 1.5, mb: 2 }}>
                {KEYS.map((k) => (
                  <Box
                    key={k} role="button" onClick={() => press(k)}
                    sx={{ textAlign: 'center', fontSize: '1.5rem', color: '#dfe5ec', cursor: 'pointer', userSelect: 'none', py: { xs: 1.25, sm: 0.5 }, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' } }}
                  >
                    {k}
                  </Box>
                ))}
              </Box>
              <Box sx={{ flex: 1 }} />
              <Button
                fullWidth variant="contained" onClick={() => startCall()} disabled={!connected || !number.trim()}
                sx={{ bgcolor: GREEN, borderRadius: 1.5, py: 1.2, '&:hover': { bgcolor: '#28b14c' }, '&.Mui-disabled': { bgcolor: 'rgba(52,199,89,0.4)', color: '#f0fdf4' } }}
              >
                <CallIcon />
              </Button>
              {dialError && (
                <Typography data-testid="dial-error" variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center', color: '#fca5a5' }}>
                  {dialError}
                </Typography>
              )}
              {!connected && <Typography variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center', color: MUTED }}>Not connected — see Settings</Typography>}
            </Box>
          ) : (
            <Box sx={{ p: 1, '& .MuiInputBase-root': { bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1 }, '& label, & .MuiFormControlLabel-label, & .MuiTypography-root': { color: '#e5e7eb' } }}>
              <SipSettingsForm />
              {/* The portal has no other sign-out affordance (the rail is just
                  Dashboard + Phone), so this is it — as in the legacy panel.
                  useUserAuth().logout() also tears the softphone down: see
                  SoftphoneContext's authenticated -> false effect. */}
              {isPortalUser && (
                <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
                  <Button
                    fullWidth variant="outlined" color="inherit" startIcon={<LogoutIcon />}
                    onClick={() => userAuth.logout()} data-testid="phone-logout"
                    sx={{ borderColor: 'rgba(255,255,255,0.3)', color: '#e5e7eb' }}
                  >
                    Logout
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Bottom tabs — Dialpad / Settings */}
        {!logsOpen && !inCall && (
          <Tabs
            value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
            sx={{
              borderTop: '1px solid rgba(255,255,255,0.08)', minHeight: 48, bgcolor: PANEL_HEADER,
              '& .MuiTab-root': { minHeight: 48, color: MUTED, fontSize: '0.72rem', fontWeight: 700 },
              '& .Mui-selected': { color: `${ACCENT} !important` },
              '& .MuiTabs-indicator': { backgroundColor: ACCENT }
            }}
          >
            <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="top" label="Calls" />
            <Tab icon={<DialpadIcon fontSize="small" />} iconPosition="top" label="Dialpad" />
            <Tab icon={<SettingsIcon fontSize="small" />} iconPosition="top" label="Settings" />
          </Tabs>
        )}
      </Paper>

      {/* Global incoming-call toast */}
      <CallToast
        open={Boolean(incoming)}
        title="Incoming call"
        number={call?.remote}
        onAnswer={() => answer()}
        onReject={() => hangup()}
        onClose={() => hangup()}
      />
    </Box>
  );
}
