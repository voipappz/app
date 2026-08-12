import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, CircularProgress, Paper, Table, TableBody, TableCell, TableHead,
  TableRow, Typography,
} from '@mui/material';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { useTranslation } from 'react-i18next';
import StatCard from '../common/StatCard';
import { getDashboardEvents } from '../../services/dashboardsApi';
import { eventViewRow } from './eventViews';

const POLL_MS = 10_000;
const DEFAULT_FIELDS = ['occurred_at', 'event_type', 'action', 'call_id'];

const label = (field) => String(field).replace(/^payload\./, '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function EventWidget({ widget }) {
  const { t } = useTranslation();
  const [page, setPage] = useState({ events: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filters = useMemo(() => ({
    eventType: widget.eventType || '', action: widget.action || '',
    limit: widget.type === 'event_table' ? 10 : 1,
  }), [widget.action, widget.eventType, widget.type]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await getDashboardEvents(filters);
        if (alive) { setPage(next); setError(''); }
      } catch (reason) {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [filters]);

  if (widget.type === 'event_counter') {
    return (
      <Box data-testid={`event-widget-${widget.uuid}`}>
        <StatCard
          label={widget.title || t('dashboardBuilder.events.allEvents', 'All events')}
          value={loading ? '…' : page.total}
          icon={InsightsOutlinedIcon}
          color={error ? 'error.main' : widget.color}
        />
      </Box>
    );
  }

  const fields = widget.fields?.length ? widget.fields : DEFAULT_FIELDS;
  const rows = page.events.map(eventViewRow);
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }} data-testid={`event-widget-${widget.uuid}`}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{widget.title}</Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{t('dashboardBuilder.events.loadError', 'Could not load DuckDB events.')}</Alert>}
      {loading ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={22} /></Box> : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>{fields.map((field) => <TableCell key={field} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label(field)}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.event_id} hover>
                  {fields.map((field) => <TableCell key={field} sx={{ whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[field] ?? '—')}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.length && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{t('dashboardBuilder.events.empty', 'No matching events.')}</Typography>}
        </Box>
      )}
    </Paper>
  );
}
