import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, DialogActions,
  DialogContent, DialogTitle, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../../ui';
import ResponsiveTable from '../../shared/ResponsiveTable/ResponsiveTable';
import { reportsApi } from '../../../services/api/reportsApi';
import { formatDate } from '../../../utils/dateUtils';
import { formatNumber } from '../../../utils/numberUtils';

// One run of the report: when, how it went, who ran it, and what it returned.
// The user and the parameters are the server's own text.
const auditColumns = (t) => [
  { id: 'when', label: t('audit.when'), priority: 'primary', render: (event) => (event.created_at ? formatDate(event.created_at) : '—') },
  {
    id: 'status', label: t('audit.status'), priority: 'secondary',
    render: (event) => (
      <Chip size="small" variant="outlined"
        label={event.level === 'error' ? t('audit.failed') : t('audit.completed')}
        color={event.level === 'error' ? 'error' : 'success'} />
    ),
  },
  { id: 'user', label: t('audit.user'), render: (event) => event.actor || '—' },
  { id: 'rows', label: t('audit.rows'), align: 'end', render: (event) => formatNumber(event.rows ?? 0) },
  { id: 'duration', label: t('audit.duration'), align: 'end', render: (event) => t('audit.ms', { n: formatNumber(event.duration_ms ?? 0) }) },
  {
    id: 'params', label: t('audit.params'),
    render: (event) => (
      <Box component="span" title={event.params || ''}
        sx={{ display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.params || '—'}
      </Box>
    ),
  },
];

/** Tenant-scoped EventAudit history for one report. */
const ReportAuditDialog = ({ open, onClose, reportName }) => {
  const { t } = useTranslation('reports');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadEvents = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      const result = await reportsApi.getAudits(reportName, 100);
      setEvents(Array.isArray(result) ? result : []);
    } catch (err) {
      setEvents([]);
      setError(err.message || t('audit.loadError'));
    } finally {
      setLoading(false);
    }
  }, [open, reportName, t]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {t('audit.title')}
        {reportName && <Typography component="span" color="text.secondary"> — {reportName}</Typography>}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress size={30} /></Box>
        ) : events.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {t('audit.empty')}
          </Typography>
        ) : (
          <ResponsiveTable columns={auditColumns(t)} rows={events} getRowId={(event) => event.event_id} />
        )}
      </DialogContent>
      <DialogActions>
        <Button startIcon={<RefreshIcon />} onClick={loadEvents} disabled={loading}>{t('audit.refresh')}</Button>
        <Button onClick={onClose}>{t('audit.close')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportAuditDialog;
