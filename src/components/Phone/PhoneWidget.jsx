// PhoneWidget — WebRTC-portal-style softphone (modeled on va-voipbox-admin).
// A header phone button opens a dark, full-height panel DOCKED to the right edge:
// avatar header (name • extension, presence pill, ready status, pin/dock), bottom
// tabs (Calls · Dialpad · Settings), borderless keypad, and a big green call CTA.
// A global incoming-call dialog rings on any page. Consumes SipPhoneProvider.
import { useEffect, useRef, useState } from 'react';
import {
  Box, IconButton, Drawer, Tabs, Tab, TextField, Button, Typography, Stack,
  List, ListItemButton, ListItemText, Tooltip, Avatar,
  Select, MenuItem,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import BackspaceIcon from '@mui/icons-material/Backspace';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
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

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const DOT = { registered: '#22c55e', connecting: '#f59e0b', failed: '#ef4444', unregistered: '#94a3b8', idle: '#94a3b8', unavailable: '#ef4444' };
const LOG_COLOR = { error: '#f87171', warn: '#fbbf24', debug: '#94a3b8', log: '#cbd5e1' };
const LOG_KEY = 'sip-recent-dials';

// Portal palette (matches the old WebRTC admin's right-hand phone dock).
const PANEL = '#3b4350';      // panel body
const PANEL_HEADER = '#2f3640'; // darker header strip
const ACCENT = '#f5a623';     // active-tab orange
const GREEN = '#34c759';      // presence + call CTA
const MUTED = '#9aa6b6';      // secondary text on dark

const loadDials = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } };
const pushDial = (n) => {
  const log = [{ n, at: Date.now() }, ...loadDials().filter((d) => d.n !== n)].slice(0, 15);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }
  return log;
};

function useCallTimer(active) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) { setSecs(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

export default function PhoneWidget() {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const { status, connected, call, muted, dial, answer, hangup, sendDtmf, setMuted, settings, logs = [], clearLogs } = useSipPhoneCtx();
  // "Stick" the dock open (persistent, no backdrop) — survives reloads.
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem('sip-phone-pinned') === '1'; } catch { return false; } });
  const [open, setOpen] = useState(pinned);
  const [tab, setTab] = useState(1); // default to Dialpad, like the portal
  const [number, setNumber] = useState('');
  const [dials, setDials] = useState(loadDials);
  const [presence, setPresence] = useState('available');
  const [logsOpen, setLogsOpen] = useState(false);

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
  const timer = useCallTimer(call?.state === 'active');

  // Surface the panel automatically when a call starts.
  useEffect(() => { if (inCall) setOpen(true); }, [inCall]);

  const ext = settings?.username || '—';
  const name = settings?.displayName || settings?.username || t('phone.guest', 'guest');
  const initial = (name?.trim()?.[0] || 'G').toUpperCase();
  const statusText = connected
    ? t('phone.ready', 'Ready')
    : status === 'connecting' ? t('phone.connecting', 'Connecting…')
    : status === 'unavailable' ? t('phone.unavailable', 'Unavailable')
    : t('phone.offline', 'Offline');

  const press = (k) => {
    if (call?.state === 'active') sendDtmf(k);
    else setNumber((n) => n + k);
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
        <IconButton color="inherit" onClick={() => setOpen(true)} data-testid="phone-button">
          <Box sx={{ position: 'relative' }}>
            <PhoneIcon />
            <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 8, height: 8, borderRadius: '50%', bgcolor: DOT[status] || '#94a3b8', border: '1.5px solid #fff' }} />
          </Box>
        </IconButton>
      </Tooltip>

      <Drawer
        // Pinned ("stuck") ⇒ persistent dock: stays open, no backdrop, the app
        // behind it stays usable. Unpinned ⇒ a normal temporary overlay.
        variant={pinned ? 'persistent' : 'temporary'}
        // Always dock to the PHYSICAL right edge. MUI flips anchors under RTL, so
        // pick the value that lands on the right for the current direction.
        anchor={isRTL ? 'left' : 'right'}
        open={open}
        onClose={() => { if (!pinned) setOpen(false); }}
        // A softphone is inherently LTR (keypad 1-2-3, tab order Calls·Dialpad·Settings)
        // — force LTR inside so it reads like the portal even in a RTL app.
        PaperProps={{ dir: 'ltr', sx: { width: 340, maxWidth: '100vw', bgcolor: PANEL, color: '#e5e7eb', borderInline: 'none', display: 'flex', flexDirection: 'column', zIndex: 1300 } }}
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
              value={presence}
              onChange={(e) => setPresence(e.target.value)}
              variant="standard"
              disableUnderline
              sx={{
                mt: 0.5, fontSize: '0.72rem', fontWeight: 700, color: '#fff', borderRadius: 1, px: 1, py: 0.1,
                bgcolor: presence === 'available' ? GREEN : presence === 'away' ? '#f59e0b' : '#ef4444',
                '& .MuiSelect-select': { py: 0.2, pr: '20px !important' }, '& .MuiSvgIcon-root': { color: '#fff' },
              }}
              MenuProps={{ MenuListProps: { dense: true } }}
            >
              <MenuItem value="available">{t('phone.available', 'Available')}</MenuItem>
              <MenuItem value="away">{t('phone.away', 'Away')}</MenuItem>
              <MenuItem value="dnd">{t('phone.dnd', 'Do not disturb')}</MenuItem>
            </Select>
            <Typography sx={{ mt: 0.5, fontSize: '0.68rem', color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5 }} noWrap>
              <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: DOT[status] || '#94a3b8', display: 'inline-block' }} />
              {statusText}{settings?.domain ? ` • ${settings.domain}` : ''}
            </Typography>
          </Box>
          <Stack direction="row" sx={{ color: MUTED }}>
            <Tooltip title={t('phone.logs', 'Logs')}>
              <IconButton size="small" sx={{ color: logsOpen ? ACCENT : MUTED }} onClick={() => setLogsOpen((v) => !v)}><TerminalIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title={pinned ? t('phone.unpin', 'Unstick') : t('phone.pin', 'Keep open')}>
              <IconButton size="small" sx={{ color: pinned ? ACCENT : MUTED }} onClick={togglePin}>
                {pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
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
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
                <IconButton onClick={() => setMuted(!muted)} sx={{ color: muted ? '#ef4444' : '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.5, mb: 2 }}>
                {KEYS.map((k) => <Button key={k} sx={{ color: '#cbd5e1', fontSize: '1.1rem' }} onClick={() => press(k)}>{k}</Button>)}
              </Box>
              <Button fullWidth variant="contained" color="error" startIcon={<CallEndIcon />} onClick={() => hangup()} sx={{ borderRadius: 2, py: 1.1 }}>
                {t('phone.hangup', 'Hang up')}
              </Button>
            </Box>
          ) : (
            <>
              {tab === 0 && (
                <List dense sx={{ flex: 1, overflow: 'auto' }}>
                  {dials.length === 0 && <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: MUTED }}>{t('phone.noHistory', 'No recent calls')}</Typography>}
                  {dials.map((d) => (
                    <ListItemButton key={d.at} onClick={() => { setNumber(d.n); setTab(1); }} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                      <ListItemText
                        primary={<span style={{ direction: 'ltr', color: '#e5e7eb' }}>{d.n}</span>}
                        secondary={<span style={{ color: MUTED }}>{new Date(d.at).toLocaleString()}</span>}
                      />
                      <IconButton edge="end" sx={{ color: GREEN }} onClick={(e) => { e.stopPropagation(); startCall(d.n); }}><CallIcon fontSize="small" /></IconButton>
                    </ListItemButton>
                  ))}
                </List>
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
                        sx={{ textAlign: 'center', fontSize: '1.5rem', color: '#dfe5ec', cursor: 'pointer', userSelect: 'none', py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' } }}
                      >
                        {k}
                      </Box>
                    ))}
                    <Box sx={{ gridColumn: '2', textAlign: 'center', fontSize: '1.5rem', color: '#dfe5ec', cursor: 'pointer', userSelect: 'none', py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' } }} role="button" onClick={() => press('+')}>+</Box>
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
