import { useState, useEffect } from 'react';
import {
  Box, Typography, Chip, Paper, Dialog, DialogTitle, DialogContent,
  IconButton, CircularProgress, Tooltip, Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useGatusHealth } from '../../hooks/useGatusHealth';
import { apiService } from '../../services/apiService';

const UP = '#10b981';
const DOWN = '#ef4444';
const DURATIONS = ['1h', '24h', '7d', '30d'];

// The Gatus API sits behind the same authenticated route as the statuses list
// (useGatusHealth). A bare fetch() carried no credential, so every detail
// call came back 401 and the zoom opened empty. Go through apiService, which
// signs the request and refreshes an expired token.
const fetchText = (url) => apiService.getText(url, 'Gatus detail').catch(() => null);
const fetchJson = (url) => {
  apiService.clearCache(url);
  return apiService.get(url, { headers: { Accept: 'application/json' } }, 'Gatus detail', false, true).catch(() => null);
};

const pct = (v) => (v == null || v === '' ? '—' : `${(parseFloat(v) * 100).toFixed(2)}%`);
const ms = (v) => (v == null || v === '' ? '—' : `${Math.round(parseFloat(v))} ms`);
const when = (ts) => (ts ? new Date(ts).toLocaleString() : '—');

/** Compact recent-checks strip (Gatus-style squares). */
const HistoryBars = ({ history, height = 14, max = 30 }) => (
  <Box sx={{ display: 'flex', gap: '2px', height, width: '100%' }}>
    {history.slice(-max).map((h, i) => (
      <Tooltip key={i} title={`${when(h.timestamp)} · ${h.success ? 'UP' : 'DOWN'}${h.durationMs != null ? ` · ${h.durationMs}ms` : ''}${h.status != null ? ` · HTTP ${h.status}` : ''}`}>
        <Box sx={{ flex: 1, minWidth: '2px', borderRadius: '2px', backgroundColor: h.success ? UP : DOWN, opacity: 0.85 }} />
      </Tooltip>
    ))}
  </Box>
);

/** Tiny inline SVG sparkline for the response-time trend. */
const Sparkline = ({ values, width = 320, height = 48, color = '#3b82f6' }) => {
  const nums = (values || []).map((v) => (typeof v === 'number' ? v : 0));
  if (nums.length < 2) return <Typography variant="caption" color="text.secondary">No trend data</Typography>;
  const max = Math.max(...nums, 1);
  const min = Math.min(...nums, 0);
  const range = max - min || 1;
  const pts = nums.map((v, i) => `${(i / (nums.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const StatBox = ({ label, value, color }) => (
  <Box sx={{ flex: '1 1 auto', minWidth: 90, p: 1, borderRadius: 1, border: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-bg-secondary)' }}>
    <Typography variant="caption" sx={{ display: 'block', color: 'var(--theme-text-secondary)', textTransform: 'uppercase', fontSize: '0.58rem', letterSpacing: '0.06em' }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 700, color: color || 'inherit' }}>{value}</Typography>
  </Box>
);

/** Zoom-in detail — pulls the per-endpoint JSON (uptimes, response-times, history, events).
 *  `apiBase` lets a per-node panel point the detail fetches at the node's own
 *  Gatus API (e.g. /api/v1/nodes/:id/endpoints) instead of the system default. */
const DetailDialog = ({ ep, onClose, apiBase = '/api/v1/endpoints' }) => {
  const [uptimes, setUptimes] = useState({});
  const [rts, setRts] = useState({});
  const [hist, setHist] = useState(null);
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ep) return undefined;
    let alive = true;
    const key = ep.key;
    setLoading(true);
    Promise.all([
      Promise.all(DURATIONS.map((d) => fetchText(`${apiBase}/${key}/uptimes/${d}`).then((v) => [d, v]))),
      Promise.all(DURATIONS.map((d) => fetchText(`${apiBase}/${key}/response-times/${d}`).then((v) => [d, v]))),
      fetchJson(`${apiBase}/${key}/response-times/24h/history`),
      fetchJson(`${apiBase}/${key}/statuses?page=1&pageSize=50`),
    ]).then(([up, rt, h, st]) => {
      if (!alive) return;
      setUptimes(Object.fromEntries(up));
      setRts(Object.fromEntries(rt));
      setHist(h);
      setEvents(st?.events ? [...st.events].reverse() : []);
      setResults(st?.results ? [...st.results].reverse() : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [ep, apiBase]);

  if (!ep) return null;

  const durations = (results.map((r) => (r.duration ? r.duration / 1e6 : null)).filter((v) => v != null));
  const minMs = durations.length ? Math.round(Math.min(...durations)) : null;
  const latest = results[0] || null;
  const maxMs = durations.length ? Math.round(Math.max(...durations)) : null;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: ep.up ? UP : DOWN }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{ep.name}</Typography>
        <Typography variant="caption" color="text.secondary">{ep.group}{ep.hostname ? ` · ${ep.hostname}` : ''}</Typography>
        <Chip label={ep.up ? 'Healthy' : 'Issues Detected'} size="small" sx={{ ml: 1, fontWeight: 700, color: ep.up ? UP : DOWN, backgroundColor: ep.up ? '#10b98114' : '#ef444414' }} />
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Summary stats */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <StatBox label="Current Status" value={ep.up ? 'Operational' : 'Issues Detected'} color={ep.up ? UP : DOWN} />
          <StatBox label="Avg Response (24h)" value={ms(rts['24h'])} />
          <StatBox label="Response Range" value={minMs != null ? `${minMs}-${maxMs} ms` : '—'} />
          <StatBox label="Last Check" value={when(ep.lastCheck)} />
        </Box>

        {/* The latest check: what Gatus asked and what came back */}
        {latest && (
          <Box sx={{ mb: 2 }} data-testid="gatus-latest-check">
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>
              Latest check <Typography component="span" variant="caption" color="text.secondary">· {when(latest.timestamp)}</Typography>
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {latest.hostname && <StatBox label="Host" value={latest.hostname} />}
              {typeof latest.status === 'number' && latest.status > 0 && <StatBox label="HTTP" value={latest.status} color={latest.status < 400 ? UP : DOWN} />}
              <StatBox label="Duration" value={latest.duration ? `${Math.round(latest.duration / 1e6)} ms` : '—'} />
              {latest.ip && <StatBox label="IP" value={latest.ip} />}
            </Box>
            {(latest.conditionResults || []).map((c, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: c.success ? UP : DOWN, minWidth: 14 }}>{c.success ? '✓' : '✗'}</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>{c.condition}</Typography>
              </Box>
            ))}
            {(latest.errors || []).map((e, i) => (
              <Alert key={i} severity="error" sx={{ mt: 0.5, py: 0, '& .MuiAlert-message': { fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-word' } }}>{e}</Alert>
            ))}
          </Box>
        )}

        {/* Uptime windows */}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>Uptime Statistics</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {DURATIONS.map((d) => {
            const v = uptimes[d] != null ? parseFloat(uptimes[d]) : null;
            const c = v == null ? undefined : v >= 0.99 ? UP : v >= 0.9 ? '#f59e0b' : DOWN;
            return <StatBox key={d} label={`${d} uptime`} value={pct(uptimes[d])} color={c} />;
          })}
        </Box>

        {/* Response time trend */}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Response Time Trend <Typography component="span" variant="caption" color="text.secondary">· 24h</Typography></Typography>
        <Box sx={{ p: 1, mb: 2, border: '1px solid var(--theme-border)', borderRadius: 1, backgroundColor: 'var(--theme-bg-secondary)' }}>
          <Sparkline values={hist?.values} />
        </Box>

        {/* Recent checks */}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>Recent Checks</Typography>
        {loading ? <CircularProgress size={16} /> : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2, maxHeight: 220, overflow: 'auto' }}>
            {results.slice(0, 20).map((r, i) => {
              const failed = (r.conditionResults || []).filter((c) => !c.success);
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.78rem', py: 0.25, borderBottom: '1px solid var(--theme-border)' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: r.success ? UP : DOWN, flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ minWidth: 160 }}>{when(r.timestamp)}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.duration ? `${Math.round(r.duration / 1e6)} ms` : '—'}</Typography>
                  {typeof r.status === 'number' && <Typography variant="caption" color="text.secondary">HTTP {r.status}</Typography>}
                  {failed.length > 0 && <Typography variant="caption" color="error" sx={{ fontFamily: 'monospace' }}>✗ {failed[0].condition}</Typography>}
                  {(r.errors || []).length > 0 && <Typography variant="caption" color="error" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>{r.errors[0]}</Typography>}
                </Box>
              );
            })}
          </Box>
        )}

        {/* Events */}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>Events</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {events.length === 0 ? <Typography variant="caption" color="text.secondary">No events.</Typography> : events.slice(0, 12).map((e, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={e.type} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700,
                color: e.type === 'HEALTHY' ? UP : e.type === 'UNHEALTHY' ? DOWN : 'var(--theme-text-secondary)',
                backgroundColor: e.type === 'HEALTHY' ? '#10b98114' : e.type === 'UNHEALTHY' ? '#ef444414' : 'var(--theme-hover)' }} />
              <Typography variant="caption" color="text.secondary">{when(e.timestamp)}</Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

/** One compact square tile in the overview grid. */
const Tile = ({ ep, onClick }) => (
  <Box
    onClick={onClick}
    sx={{
      p: 1, borderRadius: 1.5, cursor: 'pointer',
      border: '1px solid', borderColor: ep.up ? '#10b98140' : '#ef444455',
      backgroundColor: ep.up ? '#10b9810a' : '#ef44440f',
      display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0,
      transition: 'transform .1s, box-shadow .1s',
      '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' },
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: ep.up ? UP : DOWN, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ep.name}>{ep.name}</Typography>
    </Box>
    <HistoryBars history={ep.history} height={12} max={24} />
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="caption" sx={{ color: 'var(--theme-text-secondary)', fontSize: '0.6rem' }}>{ep.uptime != null ? `${ep.uptime}%` : '—'}</Typography>
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.6rem', color: ep.up ? UP : DOWN }}>{ep.up ? 'UP' : 'DOWN'}</Typography>
    </Box>
  </Box>
);

/**
 * GatusHealthPanel — service health from Gatus, rendered as a compact square
 * grid (all endpoints on one screen). Click a tile to zoom into full detail.
 *
 * Two modes:
 *  - Uncontrolled (default): pulls system-wide health from `useGatusHealth`.
 *  - Controlled (per-node): pass `endpoints`/`summary`/`loading`/`error` (e.g.
 *    from `useNodeHealth`) plus a `title`/`detailApiBase` so the SAME square
 *    grid + per-endpoint zoom render for a single node's monitors.
 */
const GatusHealthPanel = (props) => {
  const hook = useGatusHealth();
  // Controlled when the caller supplies its own endpoints array (per-node).
  const controlled = Array.isArray(props.endpoints);
  const endpoints = controlled ? props.endpoints : hook.endpoints;
  const summary = controlled ? (props.summary || { total: 0, up: 0, down: 0 }) : hook.summary;
  const loading = controlled ? !!props.loading : hook.loading;
  const response = controlled ? (props.error ? { error: props.error } : {}) : hook.response;
  const title = props.title || 'Service Health';
  const detailApiBase = props.detailApiBase || '/api/v1/endpoints';

  const [selected, setSelected] = useState(null);

  if (loading && endpoints.length === 0) {
    return (
      <Paper elevation={0} sx={{ px: 2, py: 1.5, border: '1px solid var(--theme-border)', borderRadius: '8px', backgroundColor: 'var(--theme-bg-primary)', display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" sx={{ color: 'var(--theme-text-secondary)' }}>Loading service health…</Typography>
      </Paper>
    );
  }
  if (!endpoints.length) {
    return response?.error ? <Alert severity="warning" sx={{ borderRadius: '8px' }}>Status monitor unreachable: {response.error}</Alert> : null;
  }

  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid var(--theme-border)', borderRadius: '8px', backgroundColor: 'var(--theme-bg-primary)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <FavoriteIcon sx={{ fontSize: 18, color: summary.down === 0 ? UP : DOWN }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Chip label={`${summary.up}/${summary.total} up`} size="small" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, color: summary.down === 0 ? UP : DOWN, backgroundColor: summary.down === 0 ? '#10b98114' : '#ef444414' }} />
        <Typography variant="caption" sx={{ ml: 'auto', color: 'var(--theme-text-secondary)' }}>via Gatus · click a tile for details</Typography>
      </Box>

      {/* Compact square grid — fits all endpoints without scrolling */}
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {endpoints.map((ep) => <Tile key={ep.key} ep={ep} onClick={() => setSelected(ep)} />)}
      </Box>

      {selected && <DetailDialog ep={selected} apiBase={detailApiBase} onClose={() => setSelected(null)} />}
    </Paper>
  );
};

export default GatusHealthPanel;
