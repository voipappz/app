import { Alert, Box, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useWidgetValue } from './useWidgetValue';
import { formatWidgetValue } from './widgetPresentation';
import MetricChart from './MetricChart';

export default function WidgetPreview({ widget }) {
  const { value, series, loading, error, influxql } = useWidgetValue(widget, { refreshInterval: 0 });
  if (loading) return <CircularProgress size={24} aria-label="Loading preview" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return <Box aria-label="Widget preview">
    <Typography variant="subtitle2">{widget.title || 'Preview'}</Typography>
    {widget.type === 'pie' && <Typography variant="caption">Each slice represents a time bucket.</Typography>}
    {widget.aggregation === 'mean' && <Typography variant="caption">Headline shows the average in the latest time bucket.</Typography>}
    {['counter', 'stat', 'gauge'].includes(widget.type)
      ? <Typography variant="h4">{formatWidgetValue(widget, value)}</Typography>
      : <MetricChart type={widget.type} series={series} />}
    <Typography variant="caption">{series.length} rows · Last {widget.minutes} minutes</Typography>
    <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
      <Table size="small" aria-label="Preview data"><TableHead><TableRow><TableCell>Time</TableCell><TableCell>Value</TableCell><TableCell>Host</TableCell></TableRow></TableHead>
        <TableBody>{series.slice(0, 100).map((row, i) => <TableRow key={i}><TableCell>{row.time || '—'}</TableCell><TableCell>{row.value ?? '—'}</TableCell><TableCell>{row.host || '—'}</TableCell></TableRow>)}</TableBody>
      </Table>
    </Box>
    {!series.length && <Alert severity="info">No data in this time range. Try a longer time window.</Alert>}
    {influxql && <Box component="pre" sx={{ overflow: 'auto', fontSize: 12 }}>{influxql}</Box>}
  </Box>;
}
