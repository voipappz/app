// PhoneWidget — jambonz-style compact softphone: a header button opening a
// ~320px popover with bottom tabs (Dialpad · History · Settings), plus a global
// incoming-call dialog and an in-call view. Consumes the app-wide SipPhoneProvider.
import { useEffect, useRef, useState } from 'react';
import {
  Box, IconButton, Popover, Tabs, Tab, TextField, Button, Typography, Stack,
  Dialog, DialogContent, List, ListItemButton, ListItemText, Tooltip,
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
import { useTranslation } from 'react-i18next';
import { useSipPhoneCtx } from '../../context/SipPhoneContext';
import SipSettingsForm from './SipSettingsForm';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const DOT = { registered: '#16a34a', connecting: '#f59e0b', failed: '#dc2626', unregistered: '#9ca3af', idle: '#9ca3af' };
const LOG_COLOR = { error: '#f87171', warn: '#fbbf24', debug: '#94a3b8', log: '#cbd5e1' };
const LOG_KEY = 'sip-recent-dials';

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
  const { status, connected, call, muted, dial, answer, hangup, sendDtmf, setMuted, logs = [], clearLogs } = useSipPhoneCtx();
  const [anchor, setAnchor] = useState(null);
  const [tab, setTab] = useState(0);
  const [number, setNumber] = useState('');
  const [dials, setDials] = useState(loadDials);
  const ring = useRef(null);
  const logEndRef = useRef(null);

  // Auto-scroll the Logs tab to the newest line.
  useEffect(() => { if (tab === 3) logEndRef.current?.scrollIntoView({ block: 'end' }); }, [logs, tab]);

  const inCall = call && call.state !== 'ended';
  const incoming = call && call.direction === 'inbound' && call.state === 'ringing';
  const timer = useCallTimer(call?.state === 'active');

  // Open the popover automatically when a call starts so controls are visible.
  useEffect(() => { if (inCall && !anchor && ring.current) setAnchor(ring.current); }, [inCall, anchor]);

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
        <IconButton ref={ring} color="inherit" onClick={(e) => setAnchor(e.currentTarget)} data-testid="phone-button">
          <Box sx={{ position: 'relative' }}>
            <PhoneIcon />
            <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 8, height: 8, borderRadius: '50%', bgcolor: DOT[status] || '#9ca3af', border: '1.5px solid #fff' }} />
          </Box>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box sx={{ width: 320 }} data-testid="phone-popover">
          {inCall ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="overline" color="text.secondary">
                {call.direction === 'inbound' ? t('phone.inbound', 'Incoming') : t('phone.outbound', 'Calling')}
              </Typography>
              <Typography variant="h6" sx={{ direction: 'ltr' }}>{call.remote}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {call.state === 'active' ? timer : call.state === 'ringing' ? t('phone.ringing', 'Ringing…') : t('phone.connecting', 'Connecting…')}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
                <IconButton onClick={() => setMuted(!muted)} color={muted ? 'error' : 'default'}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
              </Stack>
              {/* DTMF keypad during a call */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.5, mb: 2 }}>
                {KEYS.map((k) => <Button key={k} variant="text" onClick={() => press(k)}>{k}</Button>)}
              </Box>
              <Button fullWidth variant="contained" color="error" startIcon={<CallEndIcon />} onClick={() => hangup()}>
                {t('phone.hangup', 'Hang up')}
              </Button>
            </Box>
          ) : (
            <>
              {tab === 0 && (
                <Box sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField fullWidth size="small" value={number} onChange={(e) => setNumber(e.target.value)}
                      placeholder={t('phone.enterNumber', 'Enter number')} inputProps={{ style: { direction: 'ltr', textAlign: 'center', fontSize: '1.1rem' } }} />
                    <IconButton size="small" onClick={() => setNumber((n) => n.slice(0, -1))} disabled={!number}><BackspaceIcon fontSize="small" /></IconButton>
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0.5, my: 1.5 }}>
                    {KEYS.map((k) => <Button key={k} variant="outlined" sx={{ py: 1.2, fontSize: '1.1rem', color: '#334155', borderColor: '#e5e7eb' }} onClick={() => press(k)}>{k}</Button>)}
                  </Box>
                  <Button fullWidth variant="contained" color="success" startIcon={<CallIcon />} disabled={!connected || !number.trim()} onClick={() => startCall()}>
                    {t('phone.call', 'Call')}
                  </Button>
                  {!connected && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>{t('phone.notConnected', 'Not connected — see Settings')}</Typography>}
                </Box>
              )}
              {tab === 1 && (
                <List dense sx={{ maxHeight: 280, overflow: 'auto' }}>
                  {dials.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>{t('phone.noHistory', 'No recent calls')}</Typography>}
                  {dials.map((d) => (
                    <ListItemButton key={d.at} onClick={() => { setNumber(d.n); setTab(0); }}>
                      <ListItemText primary={<span style={{ direction: 'ltr' }}>{d.n}</span>} secondary={new Date(d.at).toLocaleString()} />
                      <IconButton edge="end" color="success" onClick={(e) => { e.stopPropagation(); startCall(d.n); }}><CallIcon fontSize="small" /></IconButton>
                    </ListItemButton>
                  ))}
                </List>
              )}
              {tab === 2 && <SipSettingsForm />}
              {tab === 3 && (
                <Box sx={{ p: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{t('phone.sipLogs', 'SIP.js logs')} ({logs.length})</Typography>
                    <Button size="small" onClick={() => clearLogs?.()} disabled={!logs.length} sx={{ minWidth: 0 }}>{t('phone.clear', 'Clear')}</Button>
                  </Stack>
                  <Box sx={{ height: 300, overflow: 'auto', bgcolor: '#0f172a', borderRadius: 1, p: 1, fontFamily: 'monospace', fontSize: '0.66rem', direction: 'ltr' }}>
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
              )}

              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderTop: '1px solid #e5e7eb', minHeight: 44 }}>
                <Tab icon={<DialpadIcon fontSize="small" />} label={t('phone.dialpad', 'Dialpad')} sx={{ minHeight: 44, fontSize: '0.7rem' }} />
                <Tab icon={<HistoryIcon fontSize="small" />} label={t('phone.history', 'History')} sx={{ minHeight: 44, fontSize: '0.7rem' }} />
                <Tab icon={<SettingsIcon fontSize="small" />} label={t('phone.settings', 'Settings')} sx={{ minHeight: 44, fontSize: '0.7rem' }} />
                <Tab icon={<TerminalIcon fontSize="small" />} label={t('phone.logs', 'Logs')} sx={{ minHeight: 44, fontSize: '0.7rem' }} />
              </Tabs>
            </>
          )}
        </Box>
      </Popover>

      {/* Global incoming-call dialog — rings on any page */}
      <Dialog open={Boolean(incoming)} onClose={() => {}}>
        <DialogContent sx={{ textAlign: 'center', minWidth: 300, py: 3 }}>
          <Typography variant="overline" color="text.secondary">{t('phone.inbound', 'Incoming call')}</Typography>
          <Typography variant="h5" sx={{ my: 1, direction: 'ltr' }}>{call?.remote}</Typography>
          <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
            <Button variant="contained" color="success" startIcon={<CallIcon />} onClick={() => answer()}>{t('phone.answer', 'Answer')}</Button>
            <Button variant="contained" color="error" startIcon={<CallEndIcon />} onClick={() => hangup()}>{t('phone.decline', 'Decline')}</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
