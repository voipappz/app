import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, Drawer, IconButton, MenuItem,
  Paper, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../context/DirectionContext';
import { COUNTER_METRICS } from '../../services/dashboardsApi';
import { useDashboardBuilder } from './useDashboardBuilder';

/** One definition row: editable title/metric, save + delete. */
function WidgetRow({ widget, saving, onSave, onDelete, t }) {
  const [draft, setDraft] = useState({ title: widget.title || '', metric: widget.metric || 'total' });
  const dirty = draft.title !== (widget.title || '') || draft.metric !== (widget.metric || 'total');

  return (
    <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small" fullWidth label={t('dashboardBuilder.widgetTitle', 'Title')}
          value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <Select size="small" value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} sx={{ minWidth: 130 }}>
          {COUNTER_METRICS.map((metric) => (
            <MenuItem key={metric} value={metric}>{t(`dashboardBuilder.metric.${metric}`, metric)}</MenuItem>
          ))}
        </Select>
        <Tooltip title={t('common.buttons.save', 'Save')}>
          <span>
            <IconButton
              size="small" color="primary" disabled={!dirty || saving}
              onClick={() => onSave(widget.uuid, { title: draft.title, metric: draft.metric })}
            >
              <SaveOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('dashboardBuilder.deleteWidget', 'Delete widget')}>
          <span>
            <IconButton size="small" color="error" disabled={saving} onClick={() => onDelete(widget.uuid)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

/**
 * DashboardBuilder — edits the LOCAL widget definitions (deno-api → DuckDB).
 * A definition picks a metric from the local snapshot projection; the dashboard
 * renders those counters instead of the built-in KPI row.
 */
export default function DashboardBuilder({ open, onClose, onChange }) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const { widgets, loading, saving, error, addWidget, saveWidget, removeWidget } = useDashboardBuilder(open, onChange);
  const [newTitle, setNewTitle] = useState('');
  const [newMetric, setNewMetric] = useState('total');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    if (await addWidget({ title: newTitle.trim(), type: 'counter', metric: newMetric })) {
      setNewTitle('');
    }
  };

  return (
    <Drawer
      anchor={isRTL ? 'left' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{ 'data-testid': 'dashboard-builder', sx: { width: { xs: '100%', sm: 400 }, p: 2 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
          {t('dashboardBuilder.heading', 'Dashboard builder')}
        </Typography>
        {saving && <CircularProgress size={18} sx={{ mx: 1 }} />}
        <IconButton onClick={onClose} aria-label={t('common.buttons.close', 'Close')}><CloseIcon /></IconButton>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('dashboardBuilder.hint', 'Widgets are computed from this app’s local call events. Without widgets the default tiles show.')}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Add widget */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small" fullWidth label={t('dashboardBuilder.newWidget', 'New widget title')}
          value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Select size="small" value={newMetric} onChange={(e) => setNewMetric(e.target.value)} sx={{ minWidth: 130 }}>
          {COUNTER_METRICS.map((metric) => (
            <MenuItem key={metric} value={metric}>{t(`dashboardBuilder.metric.${metric}`, metric)}</MenuItem>
          ))}
        </Select>
        <Button variant="contained" onClick={handleAdd} disabled={saving || !newTitle.trim()} sx={{ minWidth: 0, px: 1.5 }}>
          <AddIcon fontSize="small" />
        </Button>
      </Stack>
      <Divider sx={{ mb: 2 }} />

      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : widgets.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          {t('dashboardBuilder.empty', 'No widgets defined yet.')}
        </Typography>
      ) : (
        <Stack spacing={1.5} sx={{ overflowY: 'auto' }}>
          {widgets.map((widget) => (
            confirmDelete === widget.uuid ? (
              <Paper key={widget.uuid} elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'error.main', borderRadius: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {t('dashboardBuilder.confirmDelete', 'Delete this widget?')} <b>{widget.title || widget.uuid}</b>
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" color="error" variant="contained" disabled={saving}
                    onClick={async () => { await removeWidget(widget.uuid); setConfirmDelete(null); }}>
                    {t('common.buttons.delete', 'Delete')}
                  </Button>
                  <Button size="small" onClick={() => setConfirmDelete(null)}>{t('common.buttons.cancel', 'Cancel')}</Button>
                </Stack>
              </Paper>
            ) : (
              <WidgetRow
                key={widget.uuid} widget={widget} saving={saving} t={t}
                onSave={saveWidget} onDelete={setConfirmDelete}
              />
            )
          ))}
        </Stack>
      )}
    </Drawer>
  );
}
