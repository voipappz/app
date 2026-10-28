import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Chip, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useTranslation } from 'react-i18next';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable';
import { formatTime } from '../../utils/dateUtils';

import { summarize } from '../../services/api/liveDashboardApi';
import { useCable } from '../../services/cable';
import CableStatus from './CableStatus';
import useLiveEntities from '../../hooks/useLiveEntities';
import { useLiveEnvironment } from './useLiveEnvironment';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import WidgetBoard from '../DashboardBuilder/WidgetBoard';
import LiveCallsPanel from '../Live/panels/LiveCallsPanel.jsx';
import {
  getLiveSettings, setLiveSettingsScope, statusColor, stateColor,
} from '../../services/liveSettings';

/**
 * LiveDashboard — the `/live` screen.
 *
 * ONE SOURCE: the cable. Every row on this screen is a document the va-crystal
 * node materialised from the switch's own events (LiveChannel -> JetStream
 * KV), including the agent's name, extension and status name, which the node
 * takes from the mothership when it first sees the agent and again at each
 * midnight roll-over.
 *
 * There is deliberately NO API fallback. The screen used to poll
 * `/api/users?action=agents` for names and `/api/calls` for calls in progress,
 * and merge them into the cable rows. Both were wrong for a portal token: the
 * API ignores `action=agents` for a user session (so every name was blank)
 * and holds a call only after it has ended (so "calls in progress" was never
 * more than a guess). A screen that falls back to a source that cannot answer
 * paints numbers that look live and are not. When the cable is not delivering
 * the table says so, and shows nothing.
 *
 * COLUMNS ARE BUILT ON THE FLY, not fetched: `DEFAULT_COLUMNS` in
 * liveSettings, per-tenant and user-editable, exactly like the palette.
 *
 * THE ENVIRONMENT COMES FROM THE SESSION, not a picker. A portal user has
 * exactly one environment and it is on the user object the login returned; an
 * admin follows the environment selected in the console.
 */

/** A unix-seconds timestamp as local wall-clock time; '-' when unset. */
function clockTime(value) {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return '-';
  return formatTime(n * 1000, true);
}

/** Seconds since a unix timestamp, formatted HH:MM:SS — the deployed dashboard's format. */
function elapsedFrom(value, now) {
  const ts = parseInt(value, 10);
  if (!ts || Number.isNaN(ts) || ts <= 0) return '00:00:00';
  const s = Math.max(0, Math.floor(now / 1000) - ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** A missing count reads as `-`; a real zero reads as `0`. They mean different things. */
function renderCount(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

// A headline number. Two to a row on a phone, four on a wider screen.
function StatTile({ icon, value, label }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 }, borderRadius: 2, bgcolor: 'action.hover' }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Box>
    </Paper>
  );
}

// The environment document's three live-call lists, and their words in live.json.
const CALL_LISTS = [
  { key: 'live_calls_incoming', labelKey: 'calls.incoming' },
  { key: 'live_calls_outgoing', labelKey: 'calls.outgoing' },
  { key: 'live_calls_local', labelKey: 'calls.local' },
];

// Status and state values the app has words for; any other shows as sent.
const KNOWN_STATUSES = new Set(['available', 'on_break', 'logged_out']);
const KNOWN_STATES = new Set(['waiting', 'receiving', 'ringing', 'answer', 'in_a_queue_call']);

// The agents table's place on a phone card: name on top, then status.
const CARD_PRIORITY = { user_name: 'primary', status: 'secondary' };

const LiveDashboard = () => {
  const { t } = useTranslation('live');
  const notLive = t('notLive');
  // One environment at a time: a portal user's own, or the one an account
  // picks here (useLiveEnvironment).
  const liveEnvironment = useLiveEnvironment();
  const { uuid: environmentUuid, name: environmentName } = liveEnvironment;
  const [settings, setSettings] = useState(() => getLiveSettings());
  // Durations are relative to the clock, so the table re-renders on a tick of
  // its own rather than only when data arrives.
  const [now, setNow] = useState(() => Date.now());
  const cable = useCable();
  const live = useLiveEntities(environmentUuid, null);
  // The board is saved per person, not per environment: one layout, whose
  // numbers follow whichever environment this screen watches.
  const { user: portalUser } = useUserAuth();
  const { accountUuid } = useAuth();
  const boardOwner = portalUser?.uuid || accountUuid || '';
  // Users and accounts see the same screen; the ACL decides what is on it.
  const { can } = usePermissions();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Settings are scoped per environment, the same way dashboard definitions are.
  useEffect(() => {
    if (!environmentUuid) return;
    setLiveSettingsScope(environmentUuid);
    setSettings(getLiveSettings());
  }, [environmentUuid]);

  // Built from settings, so a hidden or reordered column takes effect with no
  // server round trip and no deploy.
  const columns = useMemo(
    () => settings.columns.filter((c) => c.visible !== false),
    [settings.columns],
  );

  // Rows are the documents, as they arrive. Nothing is merged in: an agent the
  // node has not identified yet shows blank name and extension until it does.
  const agentRows = live.byScope('user');
  const liveEnv = live.byScope('environment')[0];
  const callCounts = CALL_LISTS.map(({ key, labelKey }) => ({
    key,
    label: t(labelKey),
    count: Array.isArray(liveEnv?.[key]) ? liveEnv[key].length : 0,
  }));
  const activeCalls = liveEnv ? callCounts.reduce((n, c) => n + c.count, 0) : null;

  const stats = useMemo(() => summarize(agentRows), [agentRows]);

  const cell = (row, col) => {
    const value = row[col.key];
    switch (col.render) {
      case 'elapsed':
        return <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{elapsedFrom(value, now)}</Box>;
      case 'time':
        return <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{clockTime(value)}</Box>;
      case 'count':
        return renderCount(value);
      case 'status': {
        if (!value) return '-';
        // `status` is the type the switch reports (available, on_break,
        // logged_out) and keys the colour; `status_name` is what the tenant
        // called it ("Lunch"), and is what the operator recognises.
        const c = statusColor(value, settings);
        const word = KNOWN_STATUSES.has(value) ? t(`status.${value}`) : value;
        return <Chip size="small" label={row.status_name || word} sx={{ bgcolor: c || undefined, color: c ? '#fff' : undefined, fontWeight: 500 }} />;
      }
      case 'state': {
        if (!value) return '-';
        const c = stateColor(value, settings);
        return <Chip size="small" label={KNOWN_STATES.has(value) ? t(`state.${value}`) : value} sx={{ bgcolor: c || undefined, color: c ? '#fff' : undefined, fontWeight: 500 }} />;
      }
      default:
        return value === '' || value === null || value === undefined ? '-' : String(value);
    }
  };

  return (
    // The shell's content area is fixed-height and clips: the screen scrolls
    // itself, and its sections keep their full height instead of shrinking.
    <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 }, '& > *': { flexShrink: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('title')}</Typography>
        {liveEnvironment.pickable ? (
          <TextField
            select size="small" label={t('environment.label')} value={environmentUuid}
            onChange={(e) => liveEnvironment.pick(e.target.value)}
            sx={{ minWidth: { sm: 240 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
            SelectProps={{ displayEmpty: true, inputProps: { 'data-testid': 'live-environment' } }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="" disabled>{t('environment.pick')}</MenuItem>
            {liveEnvironment.choices.map((e) => <MenuItem key={e.uuid} value={e.uuid}>{e.name || e.uuid}</MenuItem>)}
          </TextField>
        ) : environmentName && (
          <Chip label={environmentName} variant="outlined" sx={{ fontWeight: 600 }} />
        )}
      </Box>

      <CableStatus
        conn={cable}
        sub={live.subscription}
        counts={{
          user: agentRows.length,
          queue: live.byScope('queue').length,
          environment: liveEnv ? 1 : 0,
        }}
        now={now}
      />

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip label={t('summary.available', { n: stats.available })} sx={{ bgcolor: statusColor('available', settings), color: '#fff', fontWeight: 600 }} />
        <Chip label={t('summary.onCall', { n: stats.onCall })} sx={{ bgcolor: stateColor('in_a_queue_call', settings), color: '#fff', fontWeight: 600 }} />
        <Chip label={t('summary.onBreak', { n: stats.onBreak })} sx={{ bgcolor: statusColor('on_break', settings), color: '#fff', fontWeight: 600 }} />
        <Chip label={t('summary.waiting', { n: stats.waiting })} sx={{ bgcolor: stateColor('waiting', settings), color: '#fff', fontWeight: 600 }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, sm: 2 } }}>
        <StatTile icon={<PeopleIcon color="primary" />} value={stats.total} label={t('tiles.totalOnline')} />
        <StatTile
          icon={<PhoneInTalkIcon color="error" />}
          value={activeCalls === null ? '—' : activeCalls}
          label={t('tiles.activeCalls')}
        />
        <StatTile icon={<CheckCircleIcon color="success" />} value={stats.available} label={t('tiles.available')} />
        <StatTile icon={<TrendingUpIcon color="secondary" />} value={`${stats.utilization}%`} label={t('tiles.utilization')} />
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
          {activeCalls ? t('calls.titleCount', { n: activeCalls }) : t('calls.title')}
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {[t('calls.direction'), t('calls.inProgress')].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!liveEnv && (
                <TableRow>
                  <TableCell colSpan={2} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {live.connected ? t('calls.none') : notLive}
                  </TableCell>
                </TableRow>
              )}
              {liveEnv && callCounts.map((c) => (
                <TableRow key={c.key} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.label}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Calls in progress, one row each, with listen / whisper / barge /
          hang up: what the Calls screen's "Live now" tab used to show. It
          polls the API (the cable carries counts, not calls) with whoever is
          signed in: anyone whose ACL reads calls, user or account. */}
      {can('calls') && (
        <Box data-testid="live-calls-panel">
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>{t('callsInProgress')}</Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <LiveCallsPanel open />
          </Paper>
        </Box>
      )}

      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('agents.title')}</Typography>
      {/* Headers by column key: a saved column list keeps English labels. */}
      <Paper variant="outlined">
        <ResponsiveTable
          columns={columns.map((c) => ({
            id: c.key,
            label: t(`columns.${c.key}`, { defaultValue: c.label }),
            render: (row) => cell(row, c),
            priority: CARD_PRIORITY[c.key] || 'meta',
          }))}
          rows={agentRows}
          getRowId={(row) => row.id}
          emptyMessage={live.connected ? t('agents.none') : notLive}
        />
      </Paper>

      <Typography variant="caption" color="text.secondary">
        {t('footer')}
      </Typography>

      {/* The one deliberate second source here: saved Influx widgets, each
          scoped to the environment above (via the API, not the cable). */}
      {boardOwner && environmentUuid && (
        <WidgetBoard key={boardOwner} storageScope={`live-metrics:${boardOwner}`} environmentUuid={environmentUuid} />
      )}
    </Box>
  );
};

export default LiveDashboard;
