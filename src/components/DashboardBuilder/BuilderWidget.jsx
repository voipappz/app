import {
  Box, Chip, IconButton, LinearProgress, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useTranslation } from 'react-i18next';
import { formatWidgetValue, resolveIcon, thresholdColor } from './widgetPresentation';
import { withDefaults } from './widgetTemplates';

const WIDE_TYPES = new Set(['trend', 'table', 'event_table']);

function TrendPreview({ points, fields }) {
  const rows = Array.isArray(points) ? points.slice(-18) : [];
  const series = fields?.length ? fields : ['inbound', 'outbound'];
  const values = rows.map((row) => series.reduce((sum, field) => sum + (Number(row[field]) || 0), 0));
  const max = Math.max(1, ...values);

  return (
    <Box sx={{ height: 112, display: 'flex', alignItems: 'flex-end', gap: 0.5, px: 0.5, pt: 1 }}>
      {values.length ? values.map((value, index) => (
        <Box
          key={`${rows[index]?.bucket || index}`}
          sx={{ flex: 1, minWidth: 3, height: `${Math.max(6, (value / max) * 100)}%`, bgcolor: 'primary.main', borderRadius: '3px 3px 0 0', opacity: 0.8 }}
        />
      )) : (
        <Typography variant="body2" color="text.secondary" sx={{ m: 'auto' }}>No call data yet</Typography>
      )}
    </Box>
  );
}

function TablePreview({ rows, fields }) {
  const columns = (fields?.length ? fields : ['started_at', 'direction', 'status']).slice(0, 4);
  return (
    <Box sx={{ overflow: 'hidden', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`, bgcolor: 'action.hover' }}>
        {columns.map((field) => <Typography key={field} variant="caption" sx={{ p: 0.75, fontWeight: 700 }} noWrap>{field}</Typography>)}
      </Box>
      {(rows || []).slice(0, 3).map((row, index) => (
        <Box key={row.id || index} sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`, borderTop: '1px solid', borderColor: 'divider' }}>
          {columns.map((field) => <Typography key={field} variant="caption" color="text.secondary" sx={{ p: 0.75 }} noWrap>{String(row[field] ?? '—')}</Typography>)}
        </Box>
      ))}
      {!rows?.length && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No rows yet</Typography>}
    </Box>
  );
}

/** Compact, data-backed preview used inside the full dashboard-builder grid. */
export default function BuilderWidget({ widget: storedWidget, snapshot, saving, onEdit, onDuplicate, onDelete }) {
  const { t } = useTranslation();
  const widget = withDefaults(storedWidget);
  const Icon = resolveIcon(widget.icon);
  const value = Number(snapshot?.stats?.[widget.metric]) || 0;
  const accent = thresholdColor(widget, value) || widget.color || 'primary.main';
  const gaugeRange = Math.max(1, Number(widget.max) - Number(widget.min));
  const gaugeValue = Math.min(100, Math.max(0, ((value - Number(widget.min)) / gaugeRange) * 100));

  return (
    <Paper
      elevation={0}
      data-testid={`builder-widget-${widget.uuid}`}
      sx={{
        gridColumn: { xs: 'span 1', md: WIDE_TYPES.has(widget.type) ? 'span 2' : 'span 1' },
        minHeight: WIDE_TYPES.has(widget.type) ? 230 : 190,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid', borderColor: 'divider', borderRadius: 2.5,
      }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
        <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 750 }} noWrap>{widget.title}</Typography>
          <Typography variant="caption" color="text.secondary">{t(`dashboardBuilder.type.${widget.type}`, widget.type)}</Typography>
        </Box>
        <Tooltip title={t('dashboardBuilder.editWidget', 'Edit widget')}><span><IconButton size="small" disabled={saving} onClick={() => onEdit(widget)}><EditOutlinedIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={t('dashboardBuilder.duplicateWidget', 'Duplicate widget')}><span><IconButton size="small" disabled={saving} onClick={() => onDuplicate(widget)}><ContentCopyOutlinedIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={t('dashboardBuilder.deleteWidget', 'Delete widget')}><span><IconButton size="small" color="error" disabled={saving} onClick={() => onDelete(widget)}><DeleteOutlineIcon fontSize="small" /></IconButton></span></Tooltip>
      </Stack>

      <Box sx={{ flex: 1, p: 1.5, minHeight: 0 }}>
        {(widget.type === 'counter' || widget.type === 'gauge') && (
          <Stack sx={{ height: '100%' }} justifyContent="center" alignItems="center" spacing={1}>
            <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: accent }}><Icon /></Box>
            <Typography variant="h4" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatWidgetValue(widget, value)}</Typography>
            {widget.type === 'gauge' && <LinearProgress variant="determinate" value={gaugeValue} color="inherit" sx={{ width: '80%', height: 8, borderRadius: 4, color: accent }} />}
          </Stack>
        )}
        {widget.type === 'trend' && <TrendPreview points={snapshot?.calls_per_hour} fields={widget.fields} />}
        {widget.type === 'table' && <TablePreview rows={snapshot?.recent_calls} fields={widget.fields} />}
        {(widget.type === 'event_counter' || widget.type === 'event_table') && (
          <Stack sx={{ height: '100%' }} justifyContent="center" alignItems="center" spacing={1}>
            <Icon sx={{ fontSize: 38, color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('dashboardBuilder.events.duckdbView', 'DuckDB event view')}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent="center">
              {widget.eventType && <Chip size="small" label={widget.eventType} />}
              {widget.action && <Chip size="small" variant="outlined" label={widget.action} />}
              {!widget.eventType && !widget.action && <Chip size="small" variant="outlined" label={t('dashboardBuilder.events.allEvents', 'All events')} />}
            </Stack>
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
