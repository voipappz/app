// PhoneScreen — the softphone in the shared right-hand drawer. Adapted from
// the app's PhoneWidget.jsx. Core calling (dialpad, mute/hold/hangup/DTMF, transfer,
// settings) is ported; the presence/agent-status picker and the "Calls"
// history tab are not (they're admin-console-specific integrations, not part
// of the core WebRTC migration) — follow-up if wanted.
import Bdi from '../../i18n/Bdi';
import LtrIsland from '../../i18n/LtrIsland';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, IconButton, Tabs, Tab, TextField, Button, Typography, Stack, Tooltip, Avatar, Paper, Chip
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
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { useSoftphone } from '../../context/SoftphoneContext';
import { usePortalSidebar } from '../../context/PortalSidebarContext';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { useAudioLevel } from '../../hooks/useAudioLevel';
import { defaultSipSettings } from '../../lib/sip/sipSettings';
import SipSettingsForm from './SipSettingsForm.jsx';
import PhoneSignIn from './PhoneSignIn.jsx';
import CallToast from './CallToast.jsx';
import TransferControls from './TransferControls.jsx';
import PhoneCallsTab from './PhoneCallsTab.jsx';
import PhonePresence from './PhonePresence.jsx';
import { formatTime } from '../../utils/dateUtils';
import { ACCENT, GREEN, MUTED, PANEL, PANEL_HEADER } from './panelTheme.js';
// Calls · Dialpad along the bottom; Settings is the gear in the header.
// Calls remain in the shared Calls screen; the phone lives in the drawer.
const TABS = ['calls', 'dialpad'];

// The call room, after the advanced-communication Janus app: dark room,
// avatar circles that glow while that side speaks, round controls.
const ROOM = '#282c34';
const ROOM_FG = '#fdfdff';
const ROOM_SEP = '#2c2c34';
const LEAVE = '#d83838';
const SPEAK = '#00ff00';

// Close-style audio bars: five bars scaled by the stream's level.
const BARS = [0.45, 0.75, 1, 0.75, 0.45];
function Equalizer({ level, speaking, height = 22 }) {
  return (
    <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', height, mt: 1 }}>
      {BARS.map((w, i) => (
        <Box key={i} sx={{ width: 4, borderRadius: 2, bgcolor: speaking ? SPEAK : 'rgba(255,255,255,0.25)', transition: 'height 90ms linear, background-color 150ms', height: Math.max(3, Math.round(height * Math.min(1, level * 1.5) * w)) }} />
      ))}
    </Box>
  );
}

function CallAvatar({ name, sub, audio, muted, size, t }) {
  const speaking = !!audio?.speaking;
  return (
    <Box sx={{ textAlign: 'center', minWidth: 0 }}>
      <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
        <Avatar sx={{ width: size, height: size, bgcolor: '#333', color: '#41414d', border: '4px solid transparent', transition: 'all 0.2s', ...(speaking && { borderColor: SPEAK, boxShadow: `0 0 26px ${SPEAK}` }) }}>
          <PersonOutlineIcon sx={{ fontSize: size * 0.55 }} />
        </Avatar>
        {muted && (
          <Box sx={{ position: 'absolute', bottom: -8, insetInline: 0, display: 'flex', justifyContent: 'center' }}>
            <Chip label={t('call.muted')} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#40404d', color: ROOM_FG }} />
          </Box>
        )}
      </Box>
      <Typography sx={{ pt: 1.5, color: ROOM_FG, overflowWrap: 'anywhere' }}><Bdi>{name}</Bdi></Typography>
      {sub && <Typography variant="caption" sx={{ display: 'block', color: MUTED }}><Bdi>{sub}</Bdi></Typography>}
      {audio && <Equalizer level={audio.level} speaking={speaking} />}
    </Box>
  );
}

function RoundControl({ label, icon, onClick, disabled, pressed, expanded, color, size = 52, testId }) {
  return (
    <Stack alignItems="center" spacing={0.5}>
      <IconButton
        aria-label={label} aria-pressed={pressed} aria-expanded={expanded} disabled={disabled} onClick={onClick} data-testid={testId}
        sx={{
          width: size, height: size, color: ROOM_FG, bgcolor: color || 'rgba(255,255,255,0.1)', transition: 'all 0.2s',
          '&:hover': { bgcolor: color || 'rgba(255,255,255,0.18)', transform: 'scale(1.05)' },
          '&.Mui-disabled': { color: MUTED, bgcolor: 'rgba(255,255,255,0.06)' },
          '&[aria-pressed="true"]': { bgcolor: ACCENT, color: '#1f2328' }
        }}
      >
        {icon}
      </IconButton>
      <Typography variant="caption" sx={{ color: MUTED }}>{label}</Typography>
    </Stack>
  );
}
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

// `embedded` renders inside PhoneDock's drawer, filling the panel edge to edge.
// `device` (an account session only): sign the phone in as this device.
// `initialNumber`: put a clicked number in the dialpad (useCallNumber).
export default function PhoneScreen({ embedded = false, initialTab, device, initialNumber }) {
  const {
    status, connected, call, muted, held, doNotDisturb, networkAvailable, lastError,
    streams, dial, answer, hangup, sendDtmf, setMuted, setHeld, setDoNotDisturb,
    transfer, consult, settings, logs = [], clearLogs, disconnect, updateSettings
  } = useSoftphone();
  const { t } = useTranslation('phone');
  const sidebar = usePortalSidebar();
  // The user portal gets the redesigned call panel (caller card, labelled
  // controls, keypad on demand, a fixed Answer / Hang up bar). The account
  // console keeps the phone it has.
  const redesigned = useIsUserSession();

  // An account has no extension of its own: until it signs the phone in (as a
  // device, or through a user login) the panel is that sign-in. Opened for a
  // device other than the one registered, it signs in as that device.
  // The phone holds a device once its token has been fetched; a reload keeps
  // the device uuid and fetches a fresh token for it.
  const openedForOtherDevice = Boolean(device?.uuid) && device.uuid !== settings?.deviceUuid;
  const needsSignIn = !settings?.deviceUuid || openedForOtherDevice;

  const [tab, setTab] = useState(() => Math.max(TABS.indexOf(initialTab || 'dialpad'), 0));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Opening the drawer at a particular tab.
  useEffect(() => {
    if (!initialTab) return;
    const index = TABS.indexOf(initialTab);
    if (index >= 0) { setTab(index); setSettingsOpen(false); }
  }, [initialTab]);
  const [number, setNumber] = useState('');
  useEffect(() => {
    if (!initialNumber) return;
    setNumber(initialNumber);
    setTab(TABS.indexOf('dialpad'));
  }, [initialNumber]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [dialError, setDialError] = useState(null);
  const logEndRef = useRef(null);

  // Each call starts with the keypad and transfer closed.
  useEffect(() => { setKeypadOpen(false); setTransferOpen(false); }, [call?.id]);

  useEffect(() => { void requestIncomingCallNotifications(); }, []);
  useEffect(() => { if (logsOpen) logEndRef.current?.scrollIntoView({ block: 'end' }); }, [logs, logsOpen]);

  const inCall = call && call.state !== 'ended';
  const incoming = call && call.direction === 'inbound' && call.state === 'ringing';
  // A live transfer owns the hold state and keeps the panel on screen.
  const transferBusy = Boolean(transfer) || Boolean(consult && consult.state !== 'ended');
  useIncomingCallAlerts(call);
  const timer = useCallTimer(call?.state === 'active' ? call.connectedAt : null);
  const roomActive = redesigned && call?.state === 'active';
  const localAudio = useAudioLevel(roomActive && !muted ? streams?.local : null);
  const remoteAudio = useAudioLevel(roomActive && !held ? streams?.remote : null);

  const ext = settings?.username || '—';
  const name = settings?.displayName || settings?.username || t('header.guest');
  const initial = (name?.trim()?.[0] || 'G').toUpperCase();
  const statusText = !networkAvailable
    ? t('header.networkOffline')
    : connected
      ? t('header.ready')
      : status === 'connecting' ? t('header.connecting')
        : status === 'unavailable' ? t('header.unavailable')
          : t('header.offline');

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
    if (!n) { setDialError(t('dialpad.enterNumberToCall')); return; }
    if (!connected) { setDialError(t('dialpad.notRegistered')); return; }
    setDialError(null);
    try {
      await dial(n);
    } catch (error) {
      setDialError(error?.message || t('dialpad.couldNotStart'));
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
          overflow: 'hidden', bgcolor: redesigned ? ROOM : PANEL, color: '#e5e7eb',
          display: 'flex', flexDirection: 'column',
          ...(embedded ? { flex: 1, minHeight: 0, borderRadius: 0 } : { borderRadius: 3 })
        }}
      >
        {/* Header — avatar, name / ext, ready status */}
        <Box sx={{ bgcolor: redesigned ? ROOM_SEP : PANEL_HEADER, px: 1.5, py: 1.25, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Avatar sx={{ width: 44, height: 44, bgcolor: redesigned ? '#40404d' : '#5b6675', fontSize: '1.1rem' }}>{initial}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }} noWrap>
              {name} <Box component="span" sx={{ color: MUTED, fontWeight: 400 }}>• <Bdi>{ext}</Bdi></Box>
            </Typography>
            <PhonePresence
              userUuid={device?.user_uuid || device?.userUuid}
              doNotDisturb={doNotDisturb}
              onDoNotDisturbChange={setDoNotDisturb}
            />
            <Typography sx={{ mt: 0.5, fontSize: '0.68rem', color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5 }} noWrap>
              <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: DOT[status] || '#94a3b8', display: 'inline-block' }} />
              {statusText}{settings?.domain ? <> • <Bdi>{settings.domain}</Bdi></> : ''}
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
          <Tooltip title={settingsOpen ? t('header.back') : t('header.settings')}>
            <IconButton size="small" data-testid="phone-settings" aria-label={settingsOpen ? t('header.closeSettings') : t('header.settings')}
              sx={{ color: settingsOpen ? ACCENT : MUTED }} onClick={() => setSettingsOpen((v) => !v)}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('header.logs')}>
            <IconButton size="small" aria-label={t('header.logs')} aria-pressed={logsOpen} sx={{ color: logsOpen ? ACCENT : MUTED }} onClick={() => setLogsOpen((v) => !v)}><TerminalIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>

        {/* Body */}
        <Box sx={{ display: 'flex', flexDirection: 'column', ...(embedded ? { flex: 1, minHeight: 0, overflowY: 'auto' } : { minHeight: 360 }) }}>
          {settingsOpen ? (
            <Box sx={{ p: 1, '& .MuiInputBase-root': { bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1 }, '& label, & .MuiFormControlLabel-label, & .MuiTypography-root': { color: '#e5e7eb' } }}>
              <SipSettingsForm />
              {/* An account signs the phone OUT of the device or user it
                  borrowed, and is back at the sign-in. Re-opening the sidebar
                  without params drops the device it was opened for, which
                  would otherwise sign it straight back in. */}
              <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
                <Button
                  fullWidth variant="outlined" color="inherit" startIcon={<LogoutIcon />} data-testid="phone-sign-out"
                  onClick={async () => {
                    try { await disconnect?.(); } catch { /* status shows it */ }
                    updateSettings?.(defaultSipSettings());
                    setSettingsOpen(false);
                    sidebar.open('phone', { tab: 'dialpad' });
                  }}
                  sx={{ borderColor: 'rgba(255,255,255,0.3)', color: '#e5e7eb' }}
                >
                  {t('settingsTab.signOut')}
                </Button>
              </Box>
            </Box>
          ) : logsOpen ? (
            <Box sx={{ p: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: MUTED }}>{t('logs.title', { total: logs.length })}</Typography>
                <Button size="small" onClick={() => clearLogs?.()} disabled={!logs.length} sx={{ minWidth: 0, color: MUTED }}>{t('logs.clear')}</Button>
              </Stack>
              <Box sx={{ flex: 1, maxHeight: 320, overflow: 'auto', bgcolor: '#0f172a', borderRadius: 1, p: 1, fontFamily: 'monospace', fontSize: '0.66rem', direction: 'ltr' }}>
                {logs.length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)' }}>{t('logs.empty')}</Typography>
                ) : logs.map((l, i) => (
                  <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 0.25, color: LOG_COLOR[l.level] || '#cbd5e1' }}>
                    <span style={{ color: '#475569' }}>{formatTime(l.ts, true)} </span>
                    <span style={{ color: 'var(--mui-palette-text-secondary)' }}>[{l.category}] </span>{l.content}
                  </Box>
                ))}
                <div ref={logEndRef} />
              </Box>
            </Box>
          ) : needsSignIn && !inCall ? (
            <PhoneSignIn device={openedForOtherDevice ? device : undefined} />
          ) : inCall && redesigned ? (
            <Box sx={{ p: 2, pt: 3, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', bgcolor: ROOM }}>
              {call.state === 'active' ? (
                <Box>
                  <Typography sx={{ fontWeight: 300, color: ROOM_FG }}>{t('call.duration')}</Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', color: '#fff' }}><Bdi>{timer}</Bdi></Typography>
                </Box>
              ) : (
                <Typography variant="overline" sx={{ color: MUTED }}>
                  {call.direction === 'inbound' ? t('call.incoming') : t('call.outgoing')}
                </Typography>
              )}
              <Stack direction="row" spacing={3} justifyContent="center" alignItems="flex-end" sx={{ pt: 3 }}>
                {call.state === 'active' && <CallAvatar name={t('call.you')} sub={settings?.username} audio={localAudio} muted={muted} size={72} t={t} />}
                <CallAvatar name={call.remote} sub={call.direction === 'inbound' ? t('call.incoming') : t('call.outgoing')} audio={call.state === 'active' ? remoteAudio : null} size={96} t={t} />
              </Stack>
              <Typography role="status" sx={{ pt: 2, color: held ? ACCENT : MUTED }}>
                {call.state === 'active' ? (held ? t('call.onHold') : t('call.connected')) : call.state === 'ringing' ? t('call.ringing') : t('call.connecting')}
              </Typography>
              <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ pt: 3 }}>
                <RoundControl label={muted ? t('call.unmute') : t('call.mute')} icon={muted ? <MicOffIcon /> : <MicIcon />} pressed={muted} onClick={() => setMuted(!muted)} />
                <RoundControl
                  label={held ? t('call.resume') : t('call.hold')} icon={held ? <PlayArrowIcon /> : <PauseIcon />} pressed={held} testId="phone-hold"
                  disabled={call.state !== 'active' || holdPending || transferBusy} onClick={toggleHold}
                />
                <RoundControl
                  label={t('call.transfer')} icon={<PhoneForwardedIcon />} expanded={transferOpen || transferBusy} testId="phone-transfer-open"
                  disabled={call.state !== 'active'} onClick={() => setTransferOpen((v) => !v)}
                />
                <RoundControl label={t('call.keypad')} icon={<DialpadIcon />} expanded={keypadOpen} disabled={call.state !== 'active'} onClick={() => setKeypadOpen((v) => !v)} />
              </Stack>
              <Box sx={{ width: '100%' }}>
                <TransferControls open={transferOpen} onClose={() => setTransferOpen(false)} callActive={call.state === 'active'} />
              </Box>
              {keypadOpen && (
                <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 1, pt: 2.5 }}>
                  {KEYS.map((k) => <Button key={k} disabled={call.state !== 'active'} sx={{ minWidth: 0, minHeight: 48, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,0.08)', color: ROOM_FG, fontSize: '1.25rem', fontWeight: 300 }} onClick={() => sendDtmf(k)}>{k}</Button>)}
                </Box>
              )}
            </Box>
          ) : inCall ? (
            <Box sx={{ p: 2, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="overline" sx={{ color: MUTED }}>
                {call.direction === 'inbound' ? t('call.incoming') : t('call.calling')}
              </Typography>
              <Typography variant="h6" sx={{ direction: 'ltr', color: '#fff' }}>{call.remote}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: MUTED }}>
                {call.state === 'active' ? <Bdi>{timer}</Bdi> : call.state === 'ringing' ? t('call.ringing') : t('call.connecting')}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center">
                <IconButton onClick={() => setMuted(!muted)} sx={{ color: muted ? '#ef4444' : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
                <Tooltip title={held ? t('call.resume') : t('call.hold')}>
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
                <Tooltip title={t('call.transfer')}>
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
              <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.5, mt: 2, mb: 2 }}>
                {KEYS.map((k) => <Button key={k} sx={{ color: '#cbd5e1', fontSize: '1.1rem' }} onClick={() => press(k)}>{k}</Button>)}
              </Box>
              <Button fullWidth variant="contained" color="error" startIcon={<CallEndIcon />} onClick={() => hangup()} sx={{ borderRadius: 2, py: 1.1 }}>
                {t('call.hangUp')}
              </Button>
            </Box>
          ) : tab === 0 ? (
            <PhoneCallsTab
              active={!inCall && tab === 0}
              onDial={(n) => { setNumber(n); startCall(n); }}
              onOpenCall={(call) => sidebar.open('call', { call })}
            />
          ) : tab === 1 ? (
            <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <LtrIsland sx={{ position: 'relative', mb: 2 }}>
                <TextField
                  fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)}
                  placeholder={t('dialpad.enterNumber')}
                  inputProps={{ 'aria-label': t('dialpad.enterNumber'), style: { direction: 'ltr', textAlign: 'center', fontSize: '1.25rem', color: 'var(--mui-palette-text-primary)' } }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1.5 } }}
                />
                {number && (
                  <IconButton size="small" aria-label={t('dialpad.backspace')} onClick={() => setNumber((n) => n.slice(0, -1))} sx={{ ...(redesigned && { width: 44, height: 44 }), position: 'absolute', insetInlineEnd: 4, top: '50%', transform: 'translateY(-50%)', color: 'var(--mui-palette-text-secondary)' }}>
                    <BackspaceIcon fontSize="small" />
                  </IconButton>
                )}
              </LtrIsland>
              <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', rowGap: 1.5, mb: 2 }}>
                {KEYS.map((k) => redesigned ? (
                  <Button
                    key={k} onClick={() => press(k)}
                    sx={{ minHeight: 44, minWidth: 0, fontSize: '1.5rem', color: '#dfe5ec', py: { xs: 1.25, sm: 0.5 }, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' } }}
                  >
                    {k}
                  </Button>
                ) : (
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
                startIcon={redesigned ? <CallIcon /> : undefined}
                sx={{ bgcolor: GREEN, borderRadius: 1.5, py: 1.2, '&:hover': { bgcolor: '#28b14c' }, '&.Mui-disabled': { bgcolor: 'rgba(52,199,89,0.4)', color: '#f0fdf4' } }}
              >
                {redesigned ? t('dialpad.call') : <CallIcon />}
              </Button>
              {dialError && (
                <Typography data-testid="dial-error" variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center', color: '#fca5a5' }}>
                  {dialError}
                </Typography>
              )}
              {!connected && <Typography variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center', color: MUTED }}>{t('dialpad.notConnected')}</Typography>}
            </Box>
          ) : null}
        </Box>

        {/* The user portal's call bar: Answer / Decline while ringing, Hang up
            once connected. Fixed under the body so it never scrolls away. */}
        {inCall && redesigned && (
          <Stack direction="row" spacing={4} justifyContent="center" sx={{ p: 2, flexShrink: 0, bgcolor: ROOM }}>
            {incoming && <RoundControl label={t('call.answer')} icon={<CallIcon sx={{ fontSize: 30 }} />} color={GREEN} size={64} onClick={() => answer()} />}
            <RoundControl label={incoming ? t('call.decline') : t('call.hangUp')} icon={<CallEndIcon sx={{ fontSize: 30 }} />} color={LEAVE} size={64} onClick={() => hangup()} />
          </Stack>
        )}

        {/* Bottom tabs — Calls / Dialpad / Assistant (Settings is the gear) */}
        {!logsOpen && !settingsOpen && !inCall && !needsSignIn && (
          <Tabs
            value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
            sx={{
              borderTop: '1px solid rgba(255,255,255,0.08)', minHeight: 48, bgcolor: redesigned ? ROOM_SEP : PANEL_HEADER,
              '& .MuiTab-root': { minHeight: 48, color: MUTED, fontSize: '0.72rem', fontWeight: 700 },
              '& .Mui-selected': { color: `${ACCENT} !important` },
              '& .MuiTabs-indicator': { backgroundColor: ACCENT }
            }}
          >
            <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="top" label={t('tabs.calls')} />
            <Tab icon={<DialpadIcon fontSize="small" />} iconPosition="top" label={t('tabs.dialpad')} />
          </Tabs>
        )}
      </Paper>

      {/* Global incoming-call toast */}
      <CallToast
        open={Boolean(incoming)}
        title={t('call.incomingTitle')}
        number={call?.remote}
        onAnswer={() => answer()}
        onReject={() => hangup()}
        onClose={() => hangup()}
      />
    </Box>
  );
}
