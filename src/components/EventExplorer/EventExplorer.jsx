import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { useEventExplorer } from './useEventExplorer';
import RawEventDialog from './RawEventDialog';

function utc(value) {
  if (!value) return '';
  const zoned = /(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = new Date(zoned);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function EventExplorer() {
  const { t } = useTranslation();
  const explorer = useEventExplorer();
  const [draft, setDraft] = useState(explorer.filters);
  const [selected, setSelected] = useState(null);
  const field = (name) => ({
    value: draft[name],
    onChange: (event) => setDraft((current) => ({ ...current, [name]: event.target.value })),
  });
  const apply = (event) => {
    event.preventDefault();
    explorer.setFilters(draft);
  };
  const clear = () => {
    const empty = { q: '', eventType: '', action: '', callId: '' };
    setDraft(empty);
    explorer.setFilters(empty);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto' }} data-testid="event-explorer">
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('eventExplorer.title', 'Raw DuckDB events')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('eventExplorer.subtitle', 'Original NATS/Cable events persisted by Deno. Select a row to inspect its raw JSON.')}
          </Typography>
        </Box>
        <Button onClick={explorer.refresh} startIcon={<RefreshIcon />} disabled={explorer.loading}>
          {t('eventExplorer.refresh', 'Refresh')}
        </Button>
      </Stack>

      <Paper component="form" onSubmit={apply} elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField size="small" fullWidth label={t('eventExplorer.search', 'Search raw JSON or IDs')} {...field('q')} />
          <TextField size="small" label={t('eventExplorer.eventType', 'Event type')} {...field('eventType')} />
          <TextField size="small" label={t('eventExplorer.action', 'Action')} {...field('action')} />
          <TextField size="small" label={t('eventExplorer.callId', 'Call ID')} {...field('callId')} />
          <Button type="submit" variant="contained" startIcon={<SearchIcon />}>{t('eventExplorer.apply', 'Apply')}</Button>
          <Button onClick={clear}>{t('eventExplorer.clear', 'Clear')}</Button>
        </Stack>
      </Paper>

      {explorer.disabled && (
        <Alert severity="info">{t('eventExplorer.disabled', 'The DuckDB inspector is disabled. Set EVENT_INSPECTOR_ENABLED=1 on Deno.')}</Alert>
      )}
      {explorer.error && <Alert severity="error">{t('eventExplorer.error', 'Could not load DuckDB events')}: {explorer.error}</Alert>}
      {!explorer.disabled && !explorer.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small" aria-label={t('eventExplorer.table', 'DuckDB event rows')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('eventExplorer.occurredAt', 'Occurred')}</TableCell>
                  <TableCell>{t('eventExplorer.eventType', 'Event type')}</TableCell>
                  <TableCell>{t('eventExplorer.action', 'Action')}</TableCell>
                  <TableCell>{t('eventExplorer.callId', 'Call ID')}</TableCell>
                  <TableCell>{t('eventExplorer.eventId', 'Event ID')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {explorer.rows.map((event) => (
                  <TableRow hover key={event.event_id} onClick={() => setSelected(event)}
                    sx={{ cursor: 'pointer' }} data-testid={`event-row-${event.event_id}`}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{utc(event.occurred_at || event.received_at)}</TableCell>
                    <TableCell><Chip size="small" label={event.event_type} variant="outlined" /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{event.action}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{event.call_id || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{event.event_id}</TableCell>
                  </TableRow>
                ))}
                {!explorer.loading && explorer.rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                    {t('eventExplorer.empty', 'No stored events match these filters.')}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {explorer.loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>}
          <TablePagination component="div" count={explorer.total} page={explorer.page}
            onPageChange={(_, page) => explorer.setPage(page)} rowsPerPage={explorer.perPage}
            onRowsPerPageChange={(event) => explorer.setPerPage(Number(event.target.value))}
            rowsPerPageOptions={[10, 25, 50, 100]} />
        </Paper>
      )}
      <RawEventDialog event={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
