// PhoneWidget — WebRTC-portal-style softphone (modeled on va-voipbox-admin).
// A header phone button opens a dark, full-height panel DOCKED to the right edge:
// avatar header (name • extension, presence pill, ready status, pin/dock), bottom
// tabs (Calls · Dialpad · Settings), borderless keypad, and a big green call CTA.
// A global incoming-call dialog rings on any page. Consumes SipPhoneProvider.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listAgentStatuses, listBreakReasons, setAgentStatus } from '../../services/agentStatusApi';
import {
  Box, IconButton, Drawer, Tabs, Tab, TextField, Button, Typography, Stack,
  List, ListItemButton, ListItemText, Tooltip, Avatar,
  Select, MenuItem, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PhoneIcon from '@mui/icons-material/Phone';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import BackspaceIcon from '@mui/icons-material/Backspace';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PhoneForwardedIcon from '@mui/icons-material/PhoneForwarded';
import DialpadIcon from '@mui/icons-material/Dialpad';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import TerminalIcon from '@mui/icons-material/Terminal';
import CloseIcon from '@mui/icons-material/Close';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { useTranslation } from 'react-i18next';
import { useSipPhoneCtx } from '../../context/SipPhoneContext';
import { useDirection } from '../../context/DirectionContext';
import SipSettingsForm from './SipSettingsForm';
import CallToast from './CallToast';
import TransferControls from './TransferControls';
import { ACCENT, GREEN, MUTED, PANEL, PANEL_HEADER } from './panelTheme';
import RecentCalls from './RecentCalls';
import { requestIncomingCallNotifications, useIncomingCallAlerts } from '../../lib/sip/useIncomingCallAlerts';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const DOT = { registered: '#22c55e', connecting: '#f59e0b', failed: '#ef4444', unregistered: '#94a3b8', idle: '#94a3b8', unavailable: '#ef4444' };
const LOG_COLOR = { error: '#f87171', warn: '#fbbf24', debug: '#94a3b8', log: '#cbd5e1' };
const LOG_KEY = 'sip-recent-dials';

const loadDials = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } };
const pushDial = (n) => {
  const log = [{ n, at: Date.now() }, ...loadDials().filter((d) => d.n !== n)].slice(0, 15);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }
  return log;
};

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

export default function PhoneWidget() {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const theme = useTheme();
  // On a phone the dock is the whole screen, so "stick it open" has nothing to
  // sit beside: a persistent, backdrop-less, full-width panel would simply hide
  // the app. Below `sm` the dock is always a temporary overlay and the pin is
  // hidden — the stored preference is left untouched for when a desktop returns.
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const {
    status, connected, call, muted, held, doNotDisturb, networkAvailable, lastError,
    dial, answer, hangup, sendDtmf, setMuted, setHeld, setDoNotDisturb,
    transfer, consult, settings, logs = [], clearLogs,
  } = useSipPhoneCtx();
  // "Stick" the dock open (persistent, no backdrop) — survives reloads.
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem('sip-phone-pinned') === '1'; } catch { return false; } });
  // A dock pinned on a desktop must not re-open over the whole screen when the
  // same session is resumed on a phone.
  const [open, setOpen] = useState(pinned && !isNarrow);
  const [tab, setTab] = useState(1); // default to Dialpad, like the portal
  const [number, setNumber] = useState('');
  const [dials, setDials] = useState(loadDials);
  const [presence, setPresence] = useState('available');
  const [statusError, setStatusError] = useState(null);
  const [agentStatuses, setAgentStatuses] = useState([]);
  const [breakReasons, setBreakReasons] = useState([]);
  const { user } = useAuth();
  const userUuid = user?.user_uuid || user?.id;
  const [logsOpen, setLogsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [holdPending, setHoldPending] = useState(false);

  // Loaded when the picker is OPENED, not on mount. These go through the shared
  // client, so a 401 drops the session — and a boot-time enrichment fetch that
  // can sign the user out is a trap: with a token the mothership rejects, every
  // page load bounced straight back to the login screen.
  //
  // The platform owns the vocabulary (GET /statuses/agent_statuses). A status is
  // a TYPE and a NAME; for on_break the name is the reason ("Lunch"), per-tenant,
  // so each reason becomes its own choice rather than a second prompt.
  const loadStatusOptions = useCallback(() => {
    if (agentStatuses.length) return;      // already have them
    listAgentStatuses().then(setAgentStatuses).catch(() => setAgentStatuses([]));
    listBreakReasons().then(setBreakReasons).catch(() => setBreakReasons([]));
  }, [agentStatuses.length]);

  const togglePin = () => setPinned((p) => {
    const next = !p;
    try { localStorage.setItem('sip-phone-pinned', next ? '1' : '0'); } catch { /* ignore */ }
    if (next) setOpen(true);
    return next;
  });
  const closePanel = () => { setOpen(false); if (pinned) { setPinned(false); try { localStorage.setItem('sip-phone-pinned', '0'); } catch { /* ignore */ } } };
  const logEndRef = useRef(null);

  useEffect(() => { if (logsOpen) logEndRef.current?.scrollIntoView({ block: 'end' }); }, [logs, logsOpen]);

  const inCall = call && call.state !== 'ended';
  const incoming = call && call.direction === 'inbound' && call.state === 'ringing';
  // A live transfer owns the hold state and keeps the panel on screen.
  const transferBusy = Boolean(transfer) || Boolean(consult && consult.state !== 'ended');
  useIncomingCallAlerts(call);
  const timer = useCallTimer(call?.state === 'active' ? call.connectedAt : null);

  // Surface the panel automatically when a call starts.
  useEffect(() => { if (inCall) setOpen(true); }, [inCall]);

  const ext = settings?.username || '—';
  const name = settings?.displayName || settings?.username || t('phone.guest', 'guest');
  const initial = (name?.trim()?.[0] || 'G').toUpperCase();
  const statusText = !networkAvailable
    ? t('phone.networkOffline', 'Network offline')
    : connected
    ? t('phone.ready', 'Ready')
    : status === 'connecting' ? t('phone.connecting', 'Connecting…')
    : status === 'unavailable' ? t('phone.unavailable', 'Unavailable')
    : t('phone.offline', 'Offline');

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
    if (!n || !connected) return;
    setDials(pushDial(n));
    try { await dial(n); } catch { /* status/UI reflects */ }
  };

  return (
    <>
      <Tooltip title={connected ? t('phone.ready', 'Ready') : t('phone.offline', 'Offline')}>
        <IconButton color="inherit" onClick={() => { setOpen(true); void requestIncomingCallNotifications(); }} data-testid="phone-button">
          <Box sx={{ position: 'relative' }}>
            <PhoneIcon />
            <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 8, height: 8, borderRadius: '50%', bgcolor: DOT[status] || '#94a3b8', border: '1.5px solid #fff' }} />
          </Box>
        </IconButton>
      </Tooltip>

      <Drawer
        // Pinned ("stuck") ⇒ persistent dock: stays open, no backdrop, the app
        // behind it stays usable. Unpinned ⇒ a normal temporary overlay.
        variant={pinned && !isNarrow ? 'persistent' : 'temporary'}
        // Always dock to the PHYSICAL right edge. MUI flips anchors under RTL, so
        // pick the value that lands on the right for the current direction.
        anchor={isRTL ? 'left' : 'right'}
        open={open}
        onClose={() => { if (!pinned || isNarrow) setOpen(false); }}
        // A softphone is inherently LTR (keypad 1-2-3, tab order Calls·Dialpad·Settings)
        // — force LTR inside so it reads like the portal even in a RTL app.
        PaperProps={{
          dir: 'ltr',
          sx: {
            // Full-bleed on a phone (340px next to a 360px screen leaves a
            // useless sliver of the app behind it), fixed dock from `sm` up.
            width: { xs: '100%', sm: 340 },
            maxWidth: '100vw',
            bgcolor: PANEL,
            color: '#e5e7eb',
            borderInline: 'none',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1300,
          },
        }}
        data-testid="phone-panel"
      >
        {/* Header — avatar, name • ext, presence, ready status, dock/close */}
        <Box sx={{ bgcolor: PANEL_HEADER, px: 1.5, py: 1.25, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Avatar sx={{ width: 44, height: 44, bgcolor: '#5b6675', fontSize: '1.1rem' }}>{initial}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }} noWrap>
              {name} <Box component="span" sx={{ color: MUTED, fontWeight: 400 }}>• {ext}</Box>
            </Typography>
            <Select
              data-testid="phone-presence-select"
              onOpen={loadStatusOptions}
              value={doNotDisturb ? 'dnd' : presence}
              // The options are fetched lazily, so until the picker is first
              // opened there is no MenuItem matching the value and the pill
              // renders EMPTY — which is what shipped. Label it from the value
              // itself; the fetched list only ever improves the wording.
              renderValue={(value) => {
                if (value === 'dnd') return t('phone.dnd', 'Do not disturb');
                const [type, name] = String(value).split(':');
                const known = agentStatuses.find((s) => s.type === type);
                const label = known
                  ? t(`phone.status.${type}`, known.label)
                  : t(`phone.status.${type}`, type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
                return name ? `${label} — ${name}` : label;
              }}
              onChange={(e) => {
                const next = e.target.value;
                setDoNotDisturb(next === 'dnd');
                if (next === 'dnd') return;   // local softphone behaviour, not a platform status
                // Optimistic: the pill moves at once, and rolls back if the
                // platform refuses. Publishing is the point — this select used
                // to change a local variable and nothing else.
                const previous = presence;
                setPresence(next);
                setStatusError(null);
                const [type, name] = next.split(':');
                setAgentStatus(userUuid, type, name)
                  .catch((error) => {
                    setPresence(previous);
                    setStatusError(error?.message || 'Could not change status');
                  });
              }}
              variant="standard"
              disableUnderline
              sx={{
                mt: 0.5, fontSize: '0.72rem', fontWeight: 700, color: '#fff', borderRadius: 1, px: 1, py: 0.1,
                bgcolor: doNotDisturb ? '#ef4444' : presence.startsWith('available') ? GREEN : '#f59e0b',
                '& .MuiSelect-select': { py: 0.2, pr: '20px !important' }, '& .MuiSvgIcon-root': { color: '#fff' },
              }}
              MenuProps={{ MenuListProps: { dense: true } }}
            >
              {/* Agent::STATUSES_MAPPINGS — the wire values the platform
                  accepts. 'away' used to sit here and matched nothing. */}
              {agentStatuses.flatMap((s) => (
                s.type === 'on_break' && breakReasons.length
                  ? breakReasons.map((reason) => (
                      <MenuItem
                        key={`${s.type}:${reason.name}`}
                        value={`${s.type}:${reason.name}`}
                        data-testid={`presence-${s.type}-${reason.name}`}
                      >
                        {t(`phone.status.${s.type}`, s.label)} — {reason.name}
                      </MenuItem>
                    ))
                  : [(
                      <MenuItem key={s.type} value={s.type} data-testid={`presence-${s.type}`}>
                        {t(`phone.status.${s.type}`, s.label)}
                      </MenuItem>
                    )]
              ))}
              {/* Local to this softphone: rejects incoming, publishes nothing. */}
              <MenuItem value="dnd">{t('phone.dnd', 'Do not disturb')}</MenuItem>
            </Select>
            {/* The pill moves optimistically, so a refusal has to be visible —
                otherwise the rollback looks like the app changing its mind. */}
            {statusError && (
              <Typography data-testid="presence-error" sx={{ fontSize: '0.65rem', color: '#f87171', mt: 0.25 }}>
                {statusError}
              </Typography>
            )}
            <Typography sx={{ mt: 0.5, fontSize: '0.68rem', color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5 }} noWrap>
              <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: DOT[status] || '#94a3b8', display: 'inline-block' }} />
              {statusText}{settings?.domain ? ` • ${settings.domain}` : ''}
            </Typography>
            {lastError && (
              <Typography title={lastError} sx={{ mt: 0.4, fontSize: '0.66rem', color: '#fca5a5' }} noWrap>
                {lastError}
              </Typography>
            )}
          </Box>
          <Stack direction="row" sx={{ color: MUTED }}>
            <Tooltip title={t('phone.logs', 'Logs')}>
              <IconButton size="small" sx={{ color: logsOpen ? ACCENT : MUTED }} onClick={() => setLogsOpen((v) => !v)}><TerminalIcon fontSize="small" /></IconButton>
            </Tooltip>
            {!isNarrow && (
              <Tooltip title={pinned ? t('phone.unpin', 'Unstick') : t('phone.pin', 'Keep open')}>
                <IconButton size="small" sx={{ color: pinned ? ACCENT : MUTED }} onClick={togglePin}>
                  {pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t('phone.close', 'Close')}>
              <IconButton size="small" sx={{ color: MUTED }} onClick={closePanel}><CloseIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Body */}
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {logsOpen ? (
            <Box sx={{ p: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: MUTED }}>{t('phone.sipLogs', 'SIP.js logs')} ({logs.length})</Typography>
                <Button size="small" onClick={() => clearLogs?.()} disabled={!logs.length} sx={{ minWidth: 0, color: MUTED }}>{t('phone.clear', 'Clear')}</Button>
              </Stack>
              <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#0f172a', borderRadius: 1, p: 1, fontFamily: 'monospace', fontSize: '0.66rem', direction: 'ltr' }}>
                {logs.length === 0 ? (
                  <Typography variant="caption" sx={{ color: '#64748b' }}>{t('phone.noLogs', 'No logs yet — connect or place a call.')}</Typography>
                ) : logs.map((l, i) => (
                  <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 0.25, color: LOG_COLOR[l.level] || '#cbd5e1' }}>
                    <span style={{ color: '#475569' }}>{new Date(l.ts).toLocaleTimeString()} </span>
                    <span style={{ color: '#64748b' }}>[{l.category}] </span>{l.content}
                  </Box>
                ))}
                <div ref={logEndRef} />
              </Box>
            </Box>
          ) : inCall ? (
            <Box sx={{ p: 2, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="overline" sx={{ color: MUTED }}>
                {call.direction === 'inbound' ? t('phone.inbound', 'Incoming') : t('phone.outbound', 'Calling')}
              </Typography>
              <Typography variant="h6" sx={{ direction: 'ltr', color: '#fff' }}>{call.remote}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: MUTED }}>
                {call.state === 'active' ? timer : call.state === 'ringing' ? t('phone.ringing', 'Ringing…') : t('phone.connecting', 'Connecting…')}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center">
                <IconButton onClick={() => setMuted(!muted)} sx={{ color: muted ? '#ef4444' : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
                <Tooltip title={held ? t('phone.resume', 'Resume') : t('phone.hold', 'Hold')}>
                  <span>
                    <IconButton
                      data-testid="phone-hold"
                      // Hold now waits for the PBX's 2xx, so it stays disabled
                      // until the re-INVITE settles. During a transfer the hold
                      // belongs to the transfer, not to the user.
                      disabled={call.state !== 'active' || holdPending || transferBusy}
                      onClick={toggleHold}
                      sx={{ color: held ? ACCENT : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}
                    >
                      {held ? <PlayArrowIcon /> : <PauseIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('phone.transfer', 'Transfer')}>
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
              <TransferControls
                open={transferOpen}
                onClose={() => setTransferOpen(false)}
                callActive={call.state === 'active'}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.5, mt: 2, mb: 2 }}>
                {KEYS.map((k) => <Button key={k} sx={{ color: '#cbd5e1', fontSize: '1.1rem' }} onClick={() => press(k)}>{k}</Button>)}
              </Box>
              <Button fullWidth variant="contained" color="error" startIcon={<CallEndIcon />} onClick={() => hangup()} sx={{ borderRadius: 2, py: 1.1 }}>
                {t('phone.hangup', 'Hang up')}
              </Button>
            </Box>
          ) : (
            <>
              {tab === 0 && (
                // Mothership call history + this browser's dial log. `active`
                // is what makes the fetch lazy — it only goes out once the dock
                // is open ON this tab, never at boot.
                <RecentCalls
                  active={open && tab === 0}
                  dials={dials}
                  onDial={(n) => startCall(n)}
                  onPickNumber={(n) => { setNumber(n); setTab(1); }}
                  onNavigate={() => { if (!pinned) setOpen(false); }}
                />
              )}
              {tab === 1 && (
                <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ position: 'relative', mb: 2 }}>
                    <TextField
                      fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)}
                      placeholder={t('phone.enterNumber', 'Enter number')}
                      inputProps={{ style: { direction: 'ltr', textAlign: 'center', fontSize: '1.25rem', color: '#0f172a' } }}
                      sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 1.5 } }}
                    />
                    {number && (
                      <IconButton size="small" onClick={() => setNumber((n) => n.slice(0, -1))} sx={{ position: 'absolute', insetInlineEnd: 4, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                        <BackspaceIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', rowGap: 1.5, mb: 2 }}>
                    {KEYS.map((k) => (
                      <Box
                        key={k} role="button" onClick={() => press(k)}
                        sx={{ textAlign: 'center', fontSize: '1.5rem', color: '#dfe5ec', cursor: 'pointer', userSelect: 'none', py: { xs: 1.25, sm: 0.5 }, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' } }}
                      >
                        {k}
                      </Box>
                    ))}
                    <Box sx={{ gridColumn: '2', textAlign: 'center', fontSize: '1.5rem', color: '#dfe5ec', cursor: 'pointer', userSelect: 'none', py: { xs: 1.25, sm: 0.5 }, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' } }} role="button" onClick={() => press('+')}>+</Box>
                  </Box>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    fullWidth variant="contained" onClick={() => startCall()} disabled={!connected || !number.trim()}
                    sx={{ bgcolor: GREEN, borderRadius: 1.5, py: 1.2, '&:hover': { bgcolor: '#28b14c' }, '&.Mui-disabled': { bgcolor: 'rgba(52,199,89,0.4)', color: '#f0fdf4' } }}
                  >
                    <CallIcon />
                  </Button>
                  {!connected && <Typography variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center', color: MUTED }}>{t('phone.notConnected', 'Not connected — see Settings')}</Typography>}
                </Box>
              )}
              {tab === 2 && (
                <Box sx={{ p: 1, '& .MuiInputBase-root': { bgcolor: '#fff', borderRadius: 1 }, '& label, & .MuiFormControlLabel-label, & .MuiTypography-root': { color: '#e5e7eb' } }}>
                  <SipSettingsForm />
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Bottom tabs — Calls · Dialpad · Settings (portal layout) */}
        {!logsOpen && !inCall && (
          <Tabs
            value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
            sx={{
              borderTop: '1px solid rgba(255,255,255,0.08)', minHeight: 48, bgcolor: PANEL_HEADER,
              '& .MuiTab-root': { minHeight: 48, color: MUTED, fontSize: '0.72rem', fontWeight: 700 },
              '& .Mui-selected': { color: `${ACCENT} !important` },
              '& .MuiTabs-indicator': { backgroundColor: ACCENT },
            }}
          >
            <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="top" label={t('phone.calls', 'Calls')} />
            <Tab icon={<DialpadIcon fontSize="small" />} iconPosition="top" label={t('phone.dialpad', 'Dialpad')} />
            <Tab icon={<SettingsIcon fontSize="small" />} iconPosition="top" label={t('phone.settings', 'Settings')} />
          </Tabs>
        )}
      </Drawer>

      {/* Global incoming-call toast (portal call-toast style) — rings on any page */}
      <CallToast
        open={Boolean(incoming)}
        title={t('phone.inbound', 'Incoming call')}
        number={call?.remote}
        onAnswer={() => answer()}
        onReject={() => hangup()}
        onClose={() => hangup()}
      />
    </>
  );
}
