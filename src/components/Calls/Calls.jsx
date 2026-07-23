import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, CircularProgress, Alert, ToggleButton,
  ToggleButtonGroup, Button, TablePagination,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import TimerIcon from '@mui/icons-material/Timer';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useCalls, computeCallStats } from './useCalls';
import Filters from '../common/Filters';
import { applyFilters } from '../common/filterModel';
import PageHeader from '../common/PageHeader';
import StatCard from '../common/StatCard';
import StatusChip from '../common/StatusChip';
import CallDetailDrawer from './CallDetailDrawer';
import { fmtDuration, fmtClock, asDate } from './callFormat';

// Transcription job status → compact chip for the grid. Unknown/none renders a dash.
const TX_COLOR = { completed: 'success', processing: 'warning', queued: 'default', failed: 'error' };
const TX_LABEL_KEY = { completed: 'transcript', processing: 'transcribing', queued: 'queued', failed: 'failed' };
function TranscriptionChip({ status }) {
  const { t } = useTranslation();
  const color = TX_COLOR[status];
  if (!color) return <span style={{ color: 'var(--mui-palette-text-disabled, #aaa)' }}>—</span>;
  return <Chip size="small" icon={<SubtitlesIcon sx={{ fontSize: 15 }} />} label={t(`calls.tx.${TX_LABEL_KEY[status]}`)}
    color={color} variant="outlined" sx={{ borderRadius: '6px', fontSize: '0.7rem', unicodeBidi: 'isolate' }} />;
}

/**
 * Calls page — rows come from the DuckDB event store via `GET /calls`
 * (server-side `calls_view` aggregation over the events table). Live updates
 * arrive over the `/ws/events` WebSocket (LavinMQ tap). KPI cards summarize the
 * set; the table supports grouping (time → status) and column sorting; a
 * row-click opens the event timeline. RTL/Hebrew-first, responsive (CSS grid
 * KPI band + horizontally-scrolling table that hides low-value columns on phones).
 */

function timeBucket(startedAt) {
  const d = asDate(startedAt);
  if (!d || isNaN(d)) return 'Older';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86_400_000;
  if (d >= startToday) return 'Today';
  if (d >= new Date(startToday - dayMs)) return 'Yesterday';
  if (d >= new Date(startToday - 7 * dayMs)) return 'This week';
  return 'Older';
}
const TIME_ORDER = ['Today', 'Yesterday', 'This week', 'Older'];
const STATUS_ORDER = ['in_progress', 'ringing', 'completed', 'no_answer', 'busy', 'failed'];

// `hide` columns drop out below the md breakpoint to keep the table usable on phones.
const COLUMNS = [
  { key: 'direction', labelKey: null, sortable: false },
  { key: 'from_number', labelKey: 'from', sortable: true },
  { key: 'to_number', labelKey: 'to', sortable: true },
  { key: 'duration_seconds', labelKey: 'duration', sortable: true, align: 'right' },
  { key: 'status', labelKey: 'status', sortable: true },
  { key: 'started_at', labelKey: 'started', sortable: true, hide: true },
  { key: 'leg_count', labelKey: 'legs', sortable: true, align: 'right', hide: true },
  { key: 'event_count', labelKey: 'events', sortable: true, align: 'right', hide: true },
  { key: 'transcription_status', labelKey: 'transcript', sortable: true },
];
const colDisplay = (col) => (col.hide ? { display: { xs: 'none', md: 'table-cell' } } : null);

function cmp(a, b, key, order) {
  let va = a[key], vb = b[key];
  if (key === 'started_at') { va = asDate(va)?.getTime() || 0; vb = asDate(vb)?.getTime() || 0; }
  if (key === 'duration_seconds' || key === 'leg_count' || key === 'event_count') { va = Number(va) || 0; vb = Number(vb) || 0; }
  va = va ?? ''; vb = vb ?? '';
  const r = va < vb ? -1 : va > vb ? 1 : 0;
  return order === 'asc' ? r : -r;
}

function CallRow({ c, onClick }) {
  return (
    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => onClick(c)}>
      <TableCell sx={{ width: 40 }}>{c.direction === 'inbound'
        ? <CallReceivedIcon fontSize="small" sx={{ color: 'info.main' }} />
        : <CallMadeIcon fontSize="small" sx={{ color: 'success.main' }} />}</TableCell>
      <TableCell sx={{ fontWeight: 500, unicodeBidi: 'isolate' }}>{c.from_number}</TableCell>
      <TableCell sx={{ unicodeBidi: 'isolate' }}>{c.to_number}</TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{fmtDuration(c.duration_seconds)}</TableCell>
      <TableCell><StatusChip status={c.status} /></TableCell>
      <TableCell sx={{ color: 'text.secondary', ...colDisplay(COLUMNS[5]) }}>{c.started_at ? asDate(c.started_at).toLocaleString() : '—'}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary', ...colDisplay(COLUMNS[6]) }}>{c.leg_count ?? '—'}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary', ...colDisplay(COLUMNS[7]) }}>{c.event_count ?? '—'}</TableCell>
      <TableCell><TranscriptionChip status={c.transcription_status} /></TableCell>
    </TableRow>
  );
}

function GroupHeader({ label, count, level, colSpan }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ bgcolor: level === 0 ? 'action.hover' : 'action.selected', py: 0.5, borderBottom: 'none' }}>
        <Typography variant={level === 0 ? 'subtitle2' : 'caption'} sx={{ fontWeight: level === 0 ? 700 : 600 }}>
          {label} <Chip size="small" label={count} sx={{ mx: 1, height: 18, borderRadius: '6px' }} />
        </Typography>
      </TableCell>
    </TableRow>
  );
}

export default function Calls() {
  const { t } = useTranslation();
  const {
    calls, total, page, perPage, loading, error, source,
    setPage, setPerPage, handleSortChange, applyRange, refresh, patchCall,
  } = useCalls();
  const [groupBy, setGroupBy] = useState('time');
  const [orderBy, setOrderBy] = useState('started_at');
  const [order, setOrder] = useState('desc');
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState([]);

  // Filter fields (ported from report-filters). Values are pushed to the SERVER
  // as search[...] params (see services/callsApi buildCallsQuery).
  const filterFields = useMemo(() => [
    { name: 'from_number', label: t('calls.from', 'From'), type: 'string' },
    { name: 'to_number', label: t('calls.to', 'To'), type: 'string' },
    { name: 'status', label: t('calls.status', 'Status'), type: 'multiselect', options: STATUS_ORDER },
    { name: 'direction', label: t('calls.direction', 'Direction'), type: 'select', options: ['inbound', 'outbound'] },
    { name: 'duration_seconds', label: t('calls.duration', 'Duration'), type: 'numeric' },
    { name: 'started_at', label: t('calls.started', 'Started'), type: 'time' },
  ], [t]);

  // Split the filters by where they can actually run. The `started_at` range is
  // pushed to the SERVER as search[created_at] (the only server filter this API
  // accepts — other search[<field>] params 500 it, verified live). Everything
  // else filters the current page client-side.
  const { serverRange, clientFilters } = useMemo(() => {
    let range = null;
    const rest = [];
    for (const f of filters) {
      if (f.name === 'started_at' && f.type === 'time' && (f.value?.from || f.value?.to)) {
        range = {
          start: f.value.from ? new Date(f.value.from).getTime() : 0,
          end: f.value.to ? new Date(f.value.to).getTime() : Date.now(),
        };
      } else {
        rest.push(f);
      }
    }
    return { serverRange: range, clientFilters: rest };
  }, [filters]);

  const rangeKey = JSON.stringify(serverRange);
  useEffect(() => { applyRange(serverRange); }, [rangeKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => applyFilters(calls, clientFilters), [calls, clientFilters]);
  const stats = useMemo(() => computeCallStats(filtered), [filtered]);
  const answerRate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  // Visible column count drives group-header colSpan (so it spans the table even
  // when the hide-on-mobile columns are collapsed). md+ shows all; phone hides 3.
  const visibleColSpan = COLUMNS.length;

  // Sort: mapped columns (started_at) sort on the SERVER across all pages;
  // handleSortChange returns false for unmapped ones, which then sort the
  // current page client-side (the API's other sortable fields are unverified).
  const onSort = (key) => {
    if (handleSortChange(key)) {
      setOrderBy(key);
      setOrder((prev) => (orderBy === key && prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    if (orderBy === key) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setOrderBy(key); setOrder('asc'); }
  };

  // Build grouped sections. groupBy: 'time' → time bucket then status; 'status'
  // → status only; 'none' → flat. Rows within the innermost group are sorted.
  const sections = useMemo(() => {
    const rows = [...filtered].sort((a, b) => cmp(a, b, orderBy, order));
    if (groupBy === 'none') return [{ label: null, count: rows.length, subs: [{ label: null, rows }] }];

    const byKey = (arr, keyFn) => arr.reduce((m, c) => { const k = keyFn(c); (m[k] ||= []).push(c); return m; }, {});

    if (groupBy === 'status') {
      const g = byKey(rows, (c) => c.status || 'queued');
      return STATUS_ORDER.filter((s) => g[s]).concat(Object.keys(g).filter((s) => !STATUS_ORDER.includes(s)))
        .map((s) => ({ label: s, kind: 'status', count: g[s].length, subs: [{ label: null, rows: g[s] }] }));
    }
    // time → status
    const gt = byKey(rows, (c) => timeBucket(c.started_at));
    return TIME_ORDER.filter((tk) => gt[tk]).map((tk) => {
      const gs = byKey(gt[tk], (c) => c.status || 'queued');
      const subs = STATUS_ORDER.filter((s) => gs[s]).map((s) => ({ label: s, kind: 'status', rows: gs[s] }));
      return { label: tk, kind: 'time', count: gt[tk].length, subs };
    });
  }, [filtered, groupBy, orderBy, order]);

  // Translate a group label (time bucket or status) for display.
  const groupLabel = (label, kind) =>
    kind === 'time' ? t(`calls.bucket.${label}`, label)
      : kind === 'status' ? t(`usageReports.status.${label}`, label)
        : label;

  // PostgREST has no live push — show the source and a manual Refresh.
  const sourceChip = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} data-testid="calls-source" data-source={source}>
      <Chip
        size="small"
        icon={<RadioButtonCheckedIcon fontSize="small" />}
        label={source === 'mock' ? t('calls.mock') : t('calls.source.postgrest', 'PostgREST')}
        color={source === 'mock' ? 'default' : 'success'}
        variant="outlined"
      />
      <Button
        size="small"
        variant="outlined"
        startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon sx={{ fontSize: 16 }} />}
        onClick={refresh}
        disabled={loading || source === 'mock'}
        sx={{ textTransform: 'none', borderRadius: 2 }}
      >
        {t('calls.refresh', 'Refresh')}
      </Button>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader title={t('menu.calls')} subtitle={t('calls.subtitle', { count: filtered.length })} actions={sourceChip} />

      {/* KPI cards — CSS grid (MUI v7 dropped the legacy <Grid item> API) */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, mb: 2 }}>
        <StatCard label={t('calls.total')} value={stats.total} icon={PhoneIcon} color="primary.main" />
        <StatCard label={t('calls.answered')} value={`${answerRate}%`} icon={CheckCircleIcon} color="success.main" />
        <StatCard label={t('calls.missed')} value={stats.failed} icon={PhoneMissedIcon} color="error.main" />
        <StatCard label={t('calls.avgDuration')} value={fmtClock(stats.avgDurationSec)} icon={TimerIcon} color="info.main" />
        <StatCard label={t('calls.inbound')} value={stats.inbound} icon={CallReceivedIcon} color="info.main" />
        <StatCard label={t('calls.outbound')} value={stats.outbound} icon={CallMadeIcon} color="success.main" />
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters (ported from va-voipbox-portal report-filters) */}
      <Filters fields={filterFields} value={filters} onChange={setFilters} />

      {/* Group toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
        <ToggleButtonGroup size="small" exclusive value={groupBy} onChange={(_, v) => v && setGroupBy(v)}
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600 } }}>
          <ToggleButton value="time">{t('calls.group.timeStatus')}</ToggleButton>
          <ToggleButton value="status">{t('calls.group.status')}</ToggleButton>
          <ToggleButton value="none">{t('calls.group.flat')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxWidth: '100%', overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableCell key={col.key} align={col.align} sx={{ fontWeight: 600, bgcolor: 'background.paper', ...colDisplay(col) }}>
                    {col.sortable ? (
                      <TableSortLabel active={orderBy === col.key} direction={orderBy === col.key ? order : 'asc'}
                        onClick={() => onSort(col.key)}>{col.labelKey ? t(`calls.col.${col.labelKey}`) : ''}</TableSortLabel>
                    ) : (col.labelKey ? t(`calls.col.${col.labelKey}`) : '')}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sections.map((sec, si) => (
                <Fragment key={`g-${sec.label ?? si}`}>
                  {sec.label && <GroupHeader label={groupLabel(sec.label, sec.kind)} count={sec.count} level={0} colSpan={visibleColSpan} />}
                  {sec.subs.map((sub, sj) => (
                    <Fragment key={`s-${sec.label ?? si}-${sub.label ?? sj}`}>
                      {sub.label && groupBy === 'time' &&
                        <GroupHeader label={groupLabel(sub.label, sub.kind)} count={sub.rows.length} level={1} colSpan={visibleColSpan} />}
                      {sub.rows.map((c) => <CallRow key={c.id} c={c} onClick={setSelected} />)}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              {calls.length === 0 && (
                <TableRow><TableCell colSpan={visibleColSpan} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    {t('calls.noCalls')}
                  </Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Server-side pagination — `total` is the API's X-Total (all rows), not
          just what's loaded, so the whole history is reachable. */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={perPage}
        onPageChange={(_e, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50, 100]}
        data-testid="calls-pagination"
      />

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onTxStatus={(id, status) => patchCall(id, { transcription_status: status })}
      />
    </Box>
  );
}
