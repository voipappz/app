import { Alert, Box, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useWidgetValue } from './useWidgetValue';
import { formatWidgetValue } from './widgetPresentation';
import MetricChart from './MetricChart';
import { useTranslation } from 'react-i18next';

export default function WidgetPreview({ widget }) {
  const { t } = useTranslation('widgets');
  const { value, series, loading, error, influxql } = useWidgetValue(widget, { refreshInterval: 0 });
  if (loading) return <CircularProgress size={24} aria-label={t('preview.loading')} />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return <Box aria-label={t('preview.label')}>
    <Typography variant="subtitle2">{widget.title || t('preview.fallbackTitle')}</Typography>
    {widget.type === 'pie' && <Typography variant="caption">{t('preview.pieHint')}</Typography>}
    {widget.aggregation === 'mean' && <Typography variant="caption">{t('preview.meanHint')}</Typography>}
    {['counter', 'stat', 'gauge'].includes(widget.type)
      ? <Typography variant="h4">{formatWidgetValue(widget, value)}</Typography>
      : <MetricChart type={widget.type} series={series} />}
    <Typography variant="caption">{t('preview.rows', { n: series.length, minutes: widget.minutes })}</Typography>
    <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
      <Table size="small" aria-label={t('preview.table')}><TableHead><TableRow><TableCell>{t('preview.time')}</TableCell><TableCell>{t('preview.value')}</TableCell><TableCell>{t('preview.host')}</TableCell></TableRow></TableHead>
        <TableBody>{series.slice(0, 100).map((row, i) => <TableRow key={i}><TableCell>{row.time || '—'}</TableCell><TableCell>{row.value ?? '—'}</TableCell><TableCell>{row.host || '—'}</TableCell></TableRow>)}</TableBody>
      </Table>
    </Box>
    {!series.length && <Alert severity="info">{t('preview.empty')}</Alert>}
    {influxql && <Box component="pre" sx={{ overflow: 'auto', fontSize: 12 }}>{influxql}</Box>}
  </Box>;
}
