import { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, Chip, List, ListItem, ListItemText, Divider } from '@mui/material';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import { useTranslation } from 'react-i18next';
import { eventsWsBase } from '../../Calls/useCalls';

interface EventMsg {
  type: string;
  ts: string;
  seq?: number;
  note?: string;
  [k: string]: unknown;
}

/**
 * Subscribes to the backend WebSocket event stream and renders the
 * last 30 events + a connection state chip.
 *
 * Backend sends synthetic events every 2s until a real MQTT bridge
 * (LavinMQ → /ws/events) is wired in `api/server.ts`.
 *
 * Optional `from`/`to` scope the *rendered* list to a time window (the live
 * stream itself is unchanged) so the panel honors the dashboard time filter.
 */
export default function LiveEvents({ from, to }: { from?: Date; to?: Date } = {}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventMsg[]>([]);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    const wsUrl = `${eventsWsBase()}?topics=call.%23`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setStatus('connecting');

      ws.addEventListener('open', () => setStatus('open'));
      ws.addEventListener('close', () => {
        setStatus('closed');
        // Auto-reconnect after 3s
        reconnectTimer.current = window.setTimeout(connect, 3000);
      });
      ws.addEventListener('error', () => {/* close fires too */});
      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data) as EventMsg;
          setEvents((prev) => [msg, ...prev].slice(0, 30));
        } catch {
          // ignore non-JSON
        }
      });
    }

    connect();

    return () => {
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  const statusColor = status === 'open' ? 'success' : status === 'connecting' ? 'warning' : 'error';

  // Scope the rendered list to the dashboard's time window when provided.
  const shown = from && to
    ? events.filter((e) => {
        const ms = new Date(e.ts).getTime();
        return !Number.isNaN(ms) && ms >= from.getTime() && ms <= to.getTime();
      })
    : events;

  return (
    <Paper elevation={0} sx={{ p: 2.5, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('callDashboard.liveEvents')}</Typography>
        <Chip
          size="small"
          icon={<RadioButtonCheckedIcon fontSize="small" />}
          label={status}
          color={statusColor}
          variant={status === 'open' ? 'filled' : 'outlined'}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        /ws/events
      </Typography>
      <Divider sx={{ mb: 1 }} />
      {shown.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No events yet — make sure the Deno backend is running on :4000.
        </Typography>
      ) : (
        <List dense sx={{ maxHeight: 360, overflow: 'auto', py: 0 }}>
          {shown.map((e, i) => (
            <ListItem key={`${e.seq ?? 'x'}-${e.ts}-${i}`} sx={{ py: 0.25 }}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label={e.type} variant="outlined" />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(e.ts).toLocaleTimeString()}
                    </Typography>
                  </Box>
                }
                secondary={e.note}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
