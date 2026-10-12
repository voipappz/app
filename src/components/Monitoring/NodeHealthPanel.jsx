import { Alert, Box, Chip, CircularProgress, Paper, Tooltip, Typography } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';

const UP = '#10b981';
const DOWN = '#ef4444';

// The node's own report, as it answers `node:<uuid>:node.health` over NATS
// (va-crystal node/local_health.cr), relayed by GET /api/nodes?action=connected:
//
//   { node_uuid, ok, statuses: [{ key, name, group, results: [{ success, errors }] }],
//     metrics: { calls: 3, registrations: 12, ... } }
//
// NOT Gatus. Gatus runs on the mothership and watches the mothership; this is
// what the node checks on its own box — kamailio, FreeSWITCH, its NATS link,
// its license, its disk. Each check carries ONE current result and no history,
// so it is drawn as a list, not as Gatus tiles with an uptime they do not have.

const GROUPS = {
  sip: 'SIP', media: 'Media', control: 'Control', license: 'License', system: 'System', agent: 'Agent',
};

// The counters worth a label; anything else the node reports is shown under its
// own key. A metric the node could not read is ABSENT, never 0 — so "—" is not
// rendered for it, it simply is not there.
const METRICS = [
  ['calls', 'Calls'],
  ['channels', 'Channels'],
  ['dialogs', 'Dialogs'],
  ['registrations', 'Registrations'],
  ['calls_reserved', 'Calls reserved'],
  ['calls_licensed', 'Calls licensed'],
  ['sofia_running', 'Sofia profiles running'],
  ['sofia_profiles', 'Sofia profiles'],
  ['sip_replies', 'SIP replies'],
  ['sip_replies_4xx', 'SIP 4xx'],
  ['sip_replies_5xx', 'SIP 5xx'],
  ['sip_failures', 'SIP failures'],
  ['nats_connected', 'NATS connected'],
  ['nats_connect_failures', 'NATS connect failures'],
  ['nats_requests_refused', 'NATS requests refused'],
  ['nats_relinks', 'NATS relinks'],
  ['loop_lag_ms', 'Loop lag (ms)'],
  ['loop_lag_max_ms', 'Loop lag max (ms)'],
];
const LABEL = Object.fromEntries(METRICS);
const ORDER = Object.fromEntries(METRICS.map(([k], i) => [k, i]));

// One check out of the statuses array: up/down from its single result, and the
// node's own reason when there is one (a passing check can carry a note too:
// "license expires in 3 days").
export const toCheck = (s) => {
  const r = Array.isArray(s?.results) ? s.results[s.results.length - 1] : null;
  const errors = Array.isArray(r?.errors) ? r.errors : [];
  return { key: s?.key, name: s?.name || s?.key, group: s?.group || 'other', up: !!r?.success, note: errors[0] || null };
};

export const toNodeHealth = (health) => {
  const checks = (Array.isArray(health?.statuses) ? health.statuses : []).map(toCheck);
  const metrics = health?.metrics && typeof health.metrics === 'object' ? health.metrics : {};
  const up = checks.filter((c) => c.up).length;
  return { checks, metrics, summary: { total: checks.length, up, down: checks.length - up } };
};

/**
 * NodeHealthPanel — one node's own health, from NATS.
 *
 * @param {{ title: string, row?: { connected: boolean, reason?: string, health?: Object },
 *           loading?: boolean, error?: string }} props
 *   `row` is one element of GET /api/nodes?action=connected.
 */
const NodeHealthPanel = ({ title, row, loading, error }) => {
  if (loading && !row) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">Asking the node over NATS…</Typography>
      </Box>
    );
  }
  if (error) return <Alert severity="warning" sx={{ borderRadius: '8px' }}>Node health unavailable: {error}</Alert>;
  if (!row) {
    return (
      <Alert severity="info" sx={{ borderRadius: '8px' }}>
        Not asked: only nodes in the nodes table are asked over NATS. Import this node to see its health.
      </Alert>
    );
  }
  if (!row.connected) {
    return <Alert severity="error" sx={{ borderRadius: '8px' }}>Not answering on NATS — {row.reason || 'unknown'}</Alert>;
  }

  const { checks, metrics, summary } = toNodeHealth(row.health);
  const groups = checks.reduce((acc, c) => { (acc[c.group] ||= []).push(c); return acc; }, {});
  const metricKeys = Object.keys(metrics).sort((a, b) => (ORDER[a] ?? 999) - (ORDER[b] ?? 999) || a.localeCompare(b));

  return (
    <Paper elevation={0} data-testid="node-health-panel"
      sx={{ p: 2, border: '1px solid var(--theme-border)', borderRadius: '8px', backgroundColor: 'var(--theme-bg-primary)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <FavoriteIcon sx={{ fontSize: 18, color: summary.down === 0 ? UP : DOWN }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Chip label={`${summary.up}/${summary.total} up`} size="small"
          sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, color: summary.down === 0 ? UP : DOWN, backgroundColor: summary.down === 0 ? '#10b98114' : '#ef444414' }} />
        <Typography variant="caption" sx={{ ml: 'auto', color: 'var(--theme-text-secondary)' }}>via NATS · the node&apos;s own checks</Typography>
      </Box>

      {checks.length === 0 ? (
        <Typography variant="caption" color="text.secondary">The node answered without any checks.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {Object.entries(groups).map(([group, list]) => (
            <Box key={group} sx={{ border: '1px solid var(--theme-border)', borderRadius: 1.5, p: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--theme-text-secondary)' }}>
                {GROUPS[group] || group}
              </Typography>
              {list.map((c) => (
                <Box key={c.key} data-testid={`node-check-${c.key}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, mt: '5px', borderRadius: '50%', backgroundColor: c.up ? UP : DOWN, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>{c.name}</Typography>
                    {c.note && (
                      <Typography variant="caption" sx={{ display: 'block', color: c.up ? 'var(--theme-text-secondary)' : DOWN, wordBreak: 'break-word' }}>
                        {c.note}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}

      {metricKeys.length > 0 && (
        <>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mt: 2, mb: 0.75, textTransform: 'uppercase', color: 'var(--theme-text-secondary)' }}>
            Metrics
          </Typography>
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {metricKeys.map((k) => (
              <Tooltip key={k} title={k}>
                <Box data-testid={`node-metric-${k}`} sx={{ border: '1px solid var(--theme-border)', borderRadius: 1.5, px: 1, py: 0.75 }}>
                  <Typography variant="caption" sx={{ display: 'block', color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {LABEL[k] || k.replace(/_/g, ' ')}
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{String(metrics[k])}</Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
};

export default NodeHealthPanel;
