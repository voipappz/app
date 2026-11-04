import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Chip,
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
import EntityHistory from './EntityHistory';
import useLiveEntities from '../../hooks/useLiveEntities';
import { useLiveEnvironments } from './useLiveEnvironment';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import WidgetBoard from '../DashboardBuilder/WidgetBoard';
import { applyTemplate } from '../DashboardBuilder/widgetTemplates';
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
 * THE ENVIRONMENTS COME FROM THE SESSION, not a picker. A portal user has
 * exactly one environment and it is on the user object the login returned; an
 * account shows every environment selected in the top bar (one subscription
 * each, useLiveEntities).
 *
 * A WIDGET BOARD (the Dashboard's UX, merged in, 2026-10-29): each section is a
 * 'live' widget drawn here from the cable, next to history widgets that read
 * the same entities' past from identities (/api/identities/report). Picked
 * from a menu, arranged and saved per person; no builder. First open = the
 * sections in their old order plus activity over time (LIVE_SEED).
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

// What a person's board starts as: the sections in the order the screen always
// had them, then the live data's history. Placed on the 4-column grid.
const seedItem = (key, x, y, col, row) => ({ ...applyTemplate(key), layout: { x, y, col, row } });
const liveSeed = (withCalls) => ({
  key: 'live-board-v1',
  widgets: [
    seedItem('liveSummary', 0, 0, 4, 1),
    seedItem('liveTiles', 0, 1, 4, 2),
    seedItem('liveCallCounts', 0, 3, withCalls ? 2 : 4, 2),
    ...(withCalls ? [seedItem('liveCallsInProgress', 2, 3, 2, 2)] : []),
    seedItem('liveAgents', 0, 5, 4, 4),
    seedItem('idOverTime', 0, 9, 4, 3),
  ],
});

const LiveDashboard = () => {
  const { t } = useTranslation('live');
  const notLive = t('notLive');
  const { uuids, environments } = useLiveEnvironments();
  const [settings, setSettings] = useState(() => getLiveSettings());
  // Durations are relative to the clock, so the table re-renders on a tick of
  // its own rather than only when data arrives.
  const [now, setNow] = useState(() => Date.now());
  const cable = useCable();
  const live = useLiveEntities(uuids, null);
  // The board is saved per person, not per environment: one layout, whose
  // numbers follow whichever environments this screen shows.
  const { user: portalUser } = useUserAuth();
  const { accountUuid } = useAuth();
  const boardOwner = portalUser?.uuid || accountUuid || '';
  // Users and accounts see the same screen; the ACL decides what is on it.
  const { can } = usePermissions();
  const canCalls = can('calls');
  const seed = useMemo(() => liveSeed(canCalls), [canCalls]);
  // The agent or queue whose history is open: its key, so the panel follows
  // the row the cable keeps replacing.
  const [historyOf, setHistoryOf] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Settings (columns, colours) are kept per environment: the first one shown.
  const settingsScope = uuids[0] || '';
  useEffect(() => {
    if (!settingsScope) return;
    setLiveSettingsScope(settingsScope);
    setSettings(getLiveSettings());
  }, [settingsScope]);

  // Built from settings, so a hidden or reordered column takes effect with no
  // server round trip and no deploy.
  const columns = useMemo(
    () => settings.columns.filter((c) => c.visible !== false),
    [settings.columns],
  );

  // Rows are the documents, as they arrive. Nothing is merged in: an agent the
  // node has not identified yet shows blank name and extension until it does.
  const agentRows = live.byScope('user');
  const queueRows = live.byScope('queue');
  // A queue's document has no name; an agent's names the queue it is in.
  const queueNames = useMemo(() => Object.fromEntries(agentRows
    .filter((a) => a.queue_uuid && a.queue_name).map((a) => [a.queue_uuid, a.queue_name])), [agentRows]);
  const envDocs = live.byScope('environment');
  const callCounts = CALL_LISTS.map(({ key, labelKey }) => ({
    key,
    label: t(labelKey),
    count: envDocs.reduce((n, doc) => n + (Array.isArray(doc[key]) ? doc[key].length : 0), 0),
  }));
  const activeCalls = envDocs.length ? callCounts.reduce((n, c) => n + c.count, 0) : null;

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

  // One Live section, as a widget's body: the cable's documents, never the API
  // (calls in progress excepted: it carries listen / whisper / barge / hang up
  // and polls the API with whoever is signed in, for whoever may read calls).
  const renderLive = (widget) => {
    switch (widget.section) {
      case 'summary':
        return (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'nowrap', sm: 'wrap' }, overflowX: { xs: 'auto', sm: 'visible' } }}>
            <Chip label={t('summary.available', { n: stats.available })} sx={{ bgcolor: statusColor('available', settings), color: '#fff', fontWeight: 600 }} />
            <Chip label={t('summary.onCall', { n: stats.onCall })} sx={{ bgcolor: stateColor('in_a_queue_call', settings), color: '#fff', fontWeight: 600 }} />
            <Chip label={t('summary.onBreak', { n: stats.onBreak })} sx={{ bgcolor: statusColor('on_break', settings), color: '#fff', fontWeight: 600 }} />
            <Chip label={t('summary.waiting', { n: stats.waiting })} sx={{ bgcolor: stateColor('waiting', settings), color: '#fff', fontWeight: 600 }} />
          </Box>
        );
      case 'tiles':
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, sm: 2 } }}>
            <StatTile icon={<PeopleIcon color="primary" />} value={stats.total} label={t('tiles.totalOnline')} />
            <StatTile icon={<PhoneInTalkIcon color="error" />} value={activeCalls === null ? '—' : activeCalls} label={t('tiles.activeCalls')} />
            <StatTile icon={<CheckCircleIcon color="success" />} value={stats.available} label={t('tiles.available')} />
            <StatTile icon={<TrendingUpIcon color="secondary" />} value={`${stats.utilization}%`} label={t('tiles.utilization')} />
          </Box>
        );
      case 'callCounts':
        return (
          <Box>
            <Typography variant="caption" color="text.secondary">{activeCalls ? t('calls.titleCount', { n: activeCalls }) : t('calls.title')}</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {[t('calls.direction'), t('calls.inProgress')].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!envDocs.length && (
                    <TableRow>
                      <TableCell colSpan={2} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        {live.connected ? t('calls.none') : notLive}
                      </TableCell>
                    </TableRow>
                  )}
                  {envDocs.length > 0 && callCounts.map((c) => (
                    <TableRow key={c.key} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.label}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        );
      case 'callsInProgress':
        return canCalls
          ? <Box data-testid="live-calls-panel"><LiveCallsPanel open /></Box>
          : <Typography variant="body2" color="text.secondary">{t('callsNotAllowed')}</Typography>;
      case 'agents':
        return (
          // Headers by column key: a saved column list keeps English labels.
          <ResponsiveTable
            columns={columns.map((c) => ({
              id: c.key,
              label: t(`columns.${c.key}`, { defaultValue: c.label }),
              render: (row) => cell(row, c),
              priority: CARD_PRIORITY[c.key] || 'meta',
            }))}
            rows={agentRows}
            onRowClick={(row) => setHistoryOf({ scope: 'user', id: row.id, environment_uuid: row.environment_uuid })}
            getRowId={(row) => `${row.environment_uuid || ''}:${row.id}`}
            emptyMessage={live.connected ? t('agents.none') : notLive}
          />
        );
      case 'queues':
        return (
          <ResponsiveTable
            columns={[
              { id: 'name', label: t('queues.queue'), priority: 'primary', render: (row) => queueNames[row.id] || row.queue_name || row.id },
              ...['call_count', 'answer_count', 'abandoned_count', 'no_answer_count', 'timeout_count'].map((key) => ({
                id: key, label: t(`queues.${key}`), priority: 'meta', render: (row) => renderCount(row[key]),
              })),
            ]}
            rows={queueRows}
            onRowClick={(row) => setHistoryOf({ scope: 'queue', id: row.id, environment_uuid: row.environment_uuid })}
            getRowId={(row) => `${row.environment_uuid || ''}:${row.id}`}
            emptyMessage={live.connected ? t('queues.none') : notLive}
          />
        );
      default:
        return null;
    }
  };

  return (
    // The shell's content area is fixed-height and clips: the screen scrolls
    // itself, and its sections keep their full height instead of shrinking.
    <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 }, '& > *': { flexShrink: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('title')}</Typography>
        {environments.map((e) => <Chip key={e.uuid} label={e.name || e.uuid} variant="outlined" sx={{ fontWeight: 600 }} />)}
        {!environments.length && <Typography variant="body2" color="text.secondary">{t('environment.none')}</Typography>}
      </Box>

      <CableStatus
        conn={cable}
        sub={live.subscription}
        counts={{
          user: agentRows.length,
          queue: live.byScope('queue').length,
          environment: envDocs.length,
        }}
        now={now}
      />

      {boardOwner && (
        <WidgetBoard key={`${boardOwner}|${uuids.join(',')}`} mode="live" storageScope={`live:${boardOwner}`} heading={false}
          callsScope={{ environmentUuids: uuids }} seed={seed} renderLive={renderLive} />
      )}

      {historyOf && (
        <EntityHistory
          entity={(() => {
            const doc = live.byScope(historyOf.scope).find((r) => r.id === historyOf.id && r.environment_uuid === historyOf.environment_uuid) || historyOf;
            return historyOf.scope === 'queue' ? { ...doc, name: queueNames[doc.id] || doc.queue_name || doc.id } : doc;
          })()}
          onClose={() => setHistoryOf(null)}
        />
      )}

      <Typography variant="caption" color="text.secondary">
        {t('footer')}
      </Typography>
    </Box>
  );
};

export default LiveDashboard;
