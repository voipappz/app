import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import { createBotCall } from './botCall';

// The Bot tab: the voice bot Builder runs beside the app. Talk to it as a
// caller would (hold to talk), restart it after the agent changes it, and
// read its log. Builder's server bridges the audio and holds the bot's token.

function useBotStatus(bot, secret) {
  const [status, setStatus] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(bot.statusPath, { headers: { 'x-builder-secret': secret } });
      setStatus(res.ok ? await res.json() : { up: false, ready: false });
    } catch {
      setStatus({ up: false, ready: false });
    }
  }, [bot.statusPath, secret]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  return [status, refresh];
}

function statusChip(status, restarting) {
  if (restarting) return <Chip size="small" color="warning" label="Rebuilding…" />;
  if (!status) return <Chip size="small" label="Checking…" />;
  if (status.ready) return <Chip size="small" color="success" label="Ready" />;
  if (status.up) return <Chip size="small" color="warning" label="Running, not ready" />;
  return <Chip size="small" color="error" label="Stopped" />;
}

export default function BotPanel({ bot, secret }) {
  const [status, refreshStatus] = useBotStatus(bot, secret);
  const [restarting, setRestarting] = useState(false);
  const [log, setLog] = useState('');
  const [talking, setTalking] = useState(false);
  const [note, setNote] = useState('');
  // The open call, the one being set up, which setup is current (a restart
  // or unmount moves it on), and whether the button is held right now.
  const call = useRef(null);
  const pending = useRef(null);
  const generation = useRef(0);
  const held = useRef(false);
  const logBox = useRef(null);

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch(bot.logPath, { headers: { 'x-builder-secret': secret } });
      setLog(await res.text());
      requestAnimationFrame(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; });
    } catch (error) {
      setLog(String(error));
    }
  }, [bot.logPath, secret]);

  useEffect(() => { loadLog(); }, [loadLog]);
  const hangUp = useCallback(() => {
    generation.current += 1;
    pending.current = null;
    held.current = false;
    call.current?.close();
    call.current = null;
    setTalking(false);
  }, []);

  useEffect(() => hangUp, [hangUp]);

  const restart = async () => {
    hangUp();
    setRestarting(true);
    setNote('');
    try {
      const res = await fetch(bot.restartPath, { method: 'POST', headers: { 'x-builder-secret': secret } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote(body.error || `Restart failed (${res.status})`);
    } catch (error) {
      setNote(String(error));
    } finally {
      setRestarting(false);
      refreshStatus();
      loadLog();
    }
  };

  // One call at a time: presses while it connects share the same setup, and
  // a setup that finishes after a restart or unmount is closed, not kept.
  const ensureCall = () => {
    if (call.current?.open) return Promise.resolve(call.current);
    if (pending.current) return pending.current;
    const mine = generation.current;
    const socket = new URL(bot.socketPath, window.location.href);
    socket.protocol = socket.protocol === 'https:' ? 'wss:' : 'ws:';
    socket.searchParams.set('secret', secret);
    let created = null;
    const setup = createBotCall(socket.toString(), {
      onError: (message) => setNote(message),
      onLimit: () => {
        held.current = false;
        setTalking(false);
        setNote('That was the longest a caller can speak at once (about 20 s); it was sent. Hold again to go on.');
      },
      onClose: () => {
        if (call.current === created) { call.current = null; setTalking(false); }
      }
    }).then((active) => {
      created = active;
      if (mine !== generation.current) { active.close(); throw new Error('cancelled'); }
      call.current = active;
      return active;
    }).finally(() => {
      if (pending.current === setup) pending.current = null;
    });
    pending.current = setup;
    return setup;
  };

  const startTalking = async () => {
    held.current = true;
    setNote('');
    try {
      const active = await ensureCall();
      // Released while it connected: nothing to send.
      if (!held.current) return;
      active.startSpeaking();
      setTalking(true);
    } catch (error) {
      if (error?.message !== 'cancelled') setNote(error?.message || String(error));
    }
  };

  const stopTalking = () => {
    held.current = false;
    setTalking(false);
    call.current?.stopSpeaking();
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, p: 2, overflow: 'auto', backgroundColor: 'var(--theme-bg-primary)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>{bot.name}</Typography>
        {statusChip(status, restarting)}
        {status?.port && (
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--theme-text-tertiary)', fontFamily: 'monospace' }}>port {status.port}</Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<RestartAltIcon />} onClick={restart} disabled={restarting}>
          Restart bot
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 3, border: '1px solid var(--theme-border)', borderRadius: 2 }}>
        <Button
          variant="contained"
          color={talking ? 'error' : 'primary'}
          startIcon={<MicIcon />}
          disabled={restarting || !status?.up}
          onPointerDown={startTalking}
          onPointerUp={stopTalking}
          onPointerLeave={stopTalking}
          onPointerCancel={stopTalking}
          onBlur={stopTalking}
          sx={{ px: 4, py: 1.5, borderRadius: 6 }}
        >
          {talking ? 'Listening… release to send' : 'Hold to talk'}
        </Button>
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--theme-text-tertiary)', textAlign: 'center' }}>
          Talks to the bot as a phone call would: 16 kHz audio, the bot answers out loud.
          Hold again while it speaks to interrupt. Use headphones.
        </Typography>
        {status?.up && !status?.ready && (
          <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>
            The bot is not ready for calls; its log says why.
          </Typography>
        )}
        {note && <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>{note}</Typography>}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--theme-text-primary)' }}>Bot log</Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadLog}>Refresh</Button>
      </Box>
      <Box
        ref={logBox}
        component="pre"
        data-testid="bot-log"
        sx={{ flex: 1, minHeight: 160, m: 0, p: 1.5, overflow: 'auto', fontSize: '0.75rem', whiteSpace: 'pre-wrap',
          border: '1px solid var(--theme-border)', borderRadius: 1, backgroundColor: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
      >
        {log || 'No log yet.'}
      </Box>
    </Box>
  );
}
