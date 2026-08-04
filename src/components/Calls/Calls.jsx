import { useEffect, useMemo, useState } from 'react';
import {
  Box, Chip, CircularProgress, Alert, ToggleButton,
  ToggleButtonGroup, Button, TablePagination, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import TimerIcon from '@mui/icons-material/Timer';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useCalls, computeCallStats } from './useCalls';
import Filters from '../common/Filters';
import { applyFilters } from '../common/filterModel';
import PageHeader from '../common/PageHeader';
import StatCard from '../common/StatCard';
import CallDetailDrawer from './CallDetailDrawer';
import { CallsTable, CallsCardList } from './CallsList';
import { buildSections, STATUS_ORDER } from './callsGrouping';
import { fmtClock } from './callFormat';

/**
 * End-user Calls page. History and search come from the mature mothership Calls
 * API; DuckDB remains dashboard-only. Friendly filters map to Nimbus's proven
 * server-side search contract, so they apply to the complete result set.
 *
 * The page owns the query, the filters and the grouping model (callsGrouping.js);
 * CallsList owns how that model is drawn — a sortable table on md+, tappable
 * cards below it. Exactly one of the two is mounted.
 */

export default function Calls() {
  const { t } = useTranslation();
  const theme = useTheme();
  // Below `md` the table becomes the card list. `noSsr` keeps the first paint
  // correct (this app is client-rendered, so there is nothing to hydrate).
  const isPhone = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const {
    calls, total, page, perPage, loading, error, source,
    setPage, setPerPage, handleSortChange, applyRange, applySearch, refresh, patchCall,
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

  // Map the end-user labels to the API field names used by Nimbus Admin.
  const { serverRange, serverSearch } = useMemo(() => {
    let range = null;
    const search = {};
    for (const f of filters) {
      if (f.name === 'started_at' && f.type === 'time' && (f.value?.from || f.value?.to)) {
        range = {
          start: f.value.from ? new Date(f.value.from).getTime() : 0,
          end: f.value.to ? new Date(f.value.to).getTime() : Date.now(),
        };
      } else if (f.value !== '' && f.value != null && (!Array.isArray(f.value) || f.value.length)) {
        if (f.name === 'from_number') search['call.caller'] = { value: f.value, op: 'IS' };
        if (f.name === 'to_number') search['call.callee'] = { value: f.value, op: 'IS' };
        if (f.name === 'status') search['call.cause'] = { value: f.value, op: 'IS' };
        if (f.name === 'direction') {
          const direction = f.value === 'inbound' ? 'incoming' : f.value === 'outbound' ? 'outgoing' : f.value;
          search['call.direction'] = { value: [direction], op: 'IS' };
        }
        if (f.name === 'duration_seconds') {
          const op = ({ '>': 'GTE', '>=': 'GTE', '<': 'LTE', '<=': 'LTE', '=': 'IS' })[f.op] || 'IS';
          search['call.talk_duration'] = { value: f.value, op };
        }
      }
    }
    return { serverRange: range, serverSearch: search };
  }, [filters]);

  const rangeKey = JSON.stringify(serverRange);
  const searchKey = JSON.stringify(serverSearch);
  useEffect(() => { applyRange(serverRange); }, [rangeKey]);
  useEffect(() => { applySearch(serverSearch); }, [searchKey]);

  // Static mock data has no server; keep identical filter behavior in demos/tests.
  const filtered = useMemo(() => source === 'mock' ? applyFilters(calls, filters) : calls, [calls, filters, source]);
  const stats = useMemo(() => computeCallStats(filtered), [filtered]);
  const answerRate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

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
  const sections = useMemo(
    () => buildSections(filtered, { groupBy, orderBy, order }),
    [filtered, groupBy, orderBy, order],
  );

  // Translate a group label (time bucket or status) for display.
  const groupLabel = (label, kind) =>
    kind === 'time' ? t(`calls.bucket.${label}`, label)
      : kind === 'status' ? t(`usageReports.status.${label}`, label)
        : label;

  // Calls are API-backed and have no live push; expose a manual refresh.
  const sourceChip = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} data-testid="calls-source" data-source={source}>
      <Chip
        size="small"
        icon={<RadioButtonCheckedIcon fontSize="small" />}
        label={source === 'mock' ? t('calls.mock') : t('calls.source.api', 'API')}
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

      {/* Group toggle — wraps rather than overflowing on a narrow phone, and
          sits at the start edge there (nothing to right-align against). */}
      <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, mb: 1.5 }}>
        <ToggleButtonGroup size="small" exclusive value={groupBy} onChange={(_, v) => v && setGroupBy(v)}
          sx={{
            flexWrap: 'wrap',
            '& .MuiToggleButton-root': {
              textTransform: 'none', fontWeight: 600,
              px: { xs: 1, sm: 1.5 }, fontSize: { xs: '0.7rem', sm: '0.8125rem' },
            },
          }}>
          <ToggleButton value="time">{t('calls.group.timeStatus')}</ToggleButton>
          <ToggleButton value="status">{t('calls.group.status')}</ToggleButton>
          <ToggleButton value="none">{t('calls.group.flat')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {loading ? (
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
      ) : isPhone ? (
        <CallsCardList
          sections={sections} groupBy={groupBy} groupLabel={groupLabel}
          onSelect={setSelected} isEmpty={filtered.length === 0}
        />
      ) : (
        <CallsTable
          sections={sections} groupBy={groupBy} groupLabel={groupLabel}
          orderBy={orderBy} order={order} onSort={onSort}
          onSelect={setSelected} isEmpty={filtered.length === 0}
        />
      )}

      {/* Server-side pagination — `total` is the API's X-Total (all rows), not
          just what's loaded, so the whole history is reachable. The toolbar wraps
          on a phone instead of pushing the page into a horizontal scroll. */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={perPage}
        onPageChange={(_e, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50, 100]}
        data-testid="calls-pagination"
        sx={{
          '& .MuiTablePagination-toolbar': {
            flexWrap: 'wrap', rowGap: 0.5, justifyContent: 'flex-end',
            paddingInline: { xs: 0, sm: 2 },
          },
          '& .MuiTablePagination-spacer': { display: { xs: 'none', sm: 'block' } },
          '& .MuiTablePagination-actions': { marginInlineStart: { xs: 1, sm: 2.5 } },
        }}
      />

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onTxStatus={(id, status) => patchCall(id, { transcription_status: status })}
      />
    </Box>
  );
}
