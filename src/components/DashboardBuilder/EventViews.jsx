import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddChartOutlinedIcon from '@mui/icons-material/AddchartOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import SearchIcon from '@mui/icons-material/Search';
import TableViewOutlinedIcon from '@mui/icons-material/TableViewOutlined';
import { useTranslation } from 'react-i18next';
import { getDashboardEvents } from '../../services/dashboardsApi';
import { eventFields, eventWidgetDraft } from './eventViews';

const PAGE_SIZE = 50;

export default function EventViews({ active, saving, onCreateWidget, onFields }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ q: '', eventType: '', action: '' });
  const [applied, setApplied] = useState(filters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const page = await getDashboardEvents({ ...applied, limit: PAGE_SIZE, offset });
      setEvents((current) => offset ? [...current, ...page.events] : page.events);
      setTotal(page.total);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { if (active) void load(0); }, [active, load]);
  const fields = useMemo(() => eventFields(events), [events]);
  useEffect(() => { onFields?.(fields); }, [fields, onFields]);

  const apply = (event) => {
    event?.preventDefault?.();
    setEvents([]);
    setApplied({ ...filters });
  };
  const selectEventView = (event) => {
    const next = { q: '', eventType: event.event_type || '', action: event.action || '' };
    setFilters(next);
    setEvents([]);
    setApplied(next);
  };
  const create = async (kind) => {
    await onCreateWidget?.(eventWidgetDraft(applied, kind));
  };

  return (
    <Box data-testid="dashboard-event-views">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('dashboardBuilder.events.hint', 'Browse normalized events stored in DuckDB, then turn the current view into a widget.')}
      </Typography>

      <Box component="form" onSubmit={apply} sx={{ display: 'grid', gap: 1, mb: 1.5 }}>
        <TextField
          size="small" label={t('dashboardBuilder.events.search', 'Search events')}
          value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
        />
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth size="small" label={t('dashboardBuilder.events.type', 'Event type')}
            value={filters.eventType} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))}
          />
          <TextField
            fullWidth size="small" label={t('dashboardBuilder.events.action', 'Action')}
            value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
          />
        </Stack>
        <Button type="submit" size="small" variant="outlined" startIcon={<SearchIcon />} disabled={loading}>
          {t('dashboardBuilder.events.apply', 'Apply view')}
        </Button>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Button
          size="small" variant="contained" startIcon={<AddChartOutlinedIcon />}
          disabled={saving} onClick={() => create('event_counter')} data-testid="create-event-counter"
        >
          {t('dashboardBuilder.events.createCounter', 'Create count widget')}
        </Button>
        <Button
          size="small" variant="outlined" startIcon={<TableViewOutlinedIcon />}
          disabled={saving} onClick={() => create('event_table')} data-testid="create-event-table"
        >
          {t('dashboardBuilder.events.createTable', 'Create table widget')}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('dashboardBuilder.events.resultCount', '{{shown}} of {{total}} events', { shown: events.length, total })}
      </Typography>

      <Stack spacing={1}>
        {events.map((event) => (
          <Paper key={event.event_id} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5, minWidth: 0 }}>
              <DataObjectOutlinedIcon fontSize="small" color="action" />
              <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }} noWrap>{event.event_type}</Typography>
              <Button size="small" onClick={() => selectEventView(event)}>{t('dashboardBuilder.events.use', 'Use')}</Button>
            </Stack>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {event.action && <Chip size="small" label={event.action} />}
              {event.call_id && <Chip size="small" variant="outlined" label={event.call_id} />}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {event.occurred_at || event.received_at}
            </Typography>
          </Paper>
        ))}
      </Stack>

      {loading && <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
      {!loading && events.length < total && (
        <Button fullWidth sx={{ mt: 1 }} onClick={() => load(events.length)}>
          {t('dashboardBuilder.events.loadMore', 'Load more')}
        </Button>
      )}
    </Box>
  );
}
