import {
  Box, Button, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, ListItemIcon, ListItemText, Menu,
  MenuItem, Paper, Stack, Typography
} from '@mui/material';
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlinedIcon from '@mui/icons-material/ArrowUpwardOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useState } from 'react';
import { formatWidgetValue, gaugePercent, resolveIcon, thresholdColor } from './widgetPresentation';
import { withDefaults } from './widgetTemplates';
import { useWidgetValue } from './useWidgetValue';
import MetricChart from './MetricChart';
import InfluxMetricExplorer from '../Monitoring/InfluxMetricExplorer/InfluxMetricExplorer.jsx';

const STAT_TYPES = new Set(['counter', 'gauge', 'stat']);
const CHART_TYPES = new Set(['trend', 'line', 'bar', 'pie']);
// Runs its own query on demand; the board must not poll for it.
const ON_DEMAND_TYPES = new Set(['table', 'explorer']);

function TrendPreview({ series, type }) {
  return <MetricChart series={series} type={type} />;
}

function TablePreview({ rows, fields }) {
  const [selected, setSelected] = useState(null);
  const columns = fields?.length ? fields : ['started_at', 'direction', 'status'];
  return (
    <Box sx={{ overflow: 'auto', maxHeight: 320, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(120px, 1fr))`, bgcolor: 'action.hover' }}>
        {columns.map((field) => <Typography key={field} variant="caption" sx={{ p: 0.75, fontWeight: 700 }} noWrap>{field}</Typography>)}
      </Box>
      {(rows || []).map((row, index) => (
        <Box component="button" type="button" aria-label={`Open call ${row.id || index}`} onClick={() => setSelected(row)} key={row.id || index} sx={{ width: '100%', color: 'inherit', bgcolor: 'transparent', cursor: 'pointer', textAlign: 'left', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(120px, 1fr))`, border: 0, borderTop: '1px solid', borderColor: 'divider' }}>
          {columns.map((field) => <Typography key={field} variant="caption" color="text.secondary" sx={{ p: 0.75 }} noWrap>{String(row[field] ?? '—')}</Typography>)}
        </Box>
      ))}
      {!rows?.length && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No rows yet</Typography>}
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>Call details</DialogTitle><DialogContent>
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(0, 2fr)', gap: 1 }}>
            {Object.entries(selected?.raw || selected || {}).map(([key, value]) => <Box key={key} sx={{ display: 'contents' }}>
              <Typography component="dt" sx={{ textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Typography>
              <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</Typography>
            </Box>)}
          </Box>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

/**
 * Compact, live-data preview used inside the builder grid. Influx types
 * (counter/gauge/stat/trend/line/bar/pie) query themselves via
 * useWidgetValue; 'table' reads recent_calls off the shared snapshot
 * (Postgres-backed — see useDashboardSnapshot).
 */
export default function BuilderWidget({ widget: storedWidget, snapshot, saving, onEdit, onDuplicate, onDelete, onMove, queryOptions }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const widget = withDefaults(storedWidget);
  const Icon = resolveIcon(widget.icon);
  const { value, series, error, loading, updatedAt } = useWidgetValue(ON_DEMAND_TYPES.has(widget.type) ? null : widget, queryOptions);
  const accent = thresholdColor(widget, value) || widget.color || 'primary.main';
  const gaugeValue = gaugePercent(widget, value);
  const isExplorer = widget.type === 'explorer';

  return (
    <Paper
      elevation={0}
      data-testid={`builder-widget-${widget.uuid}`}
      sx={{
        // Size and place come from the grid item around it (WidgetBoard).
        height: '100%',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid', borderColor: 'divider', borderRadius: 2.5,
        bgcolor: 'background.paper',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        '&:hover': { borderColor: 'text.disabled', boxShadow: '0 12px 30px rgba(15, 23, 42, 0.09)' }
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" className="widget-drag-handle" sx={{ px: 1.75, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover', cursor: 'grab' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 750 }} noWrap>{widget.title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{widget.type}</Typography>
        </Box>
        <IconButton size="small" disabled={saving} aria-label="Widget actions" onClick={(event) => setMenuAnchor(event.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { setMenuAnchor(null); onEdit(widget); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Edit widget" />
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onDuplicate(widget); }}>
          <ListItemIcon><ContentCopyOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Duplicate widget" />
        </MenuItem>
        {/* Order is part of the board and is saved with it (dashboardWidgetsApi):
            one step among the widgets of the same section. */}
        {onMove && (
          <MenuItem onClick={() => { setMenuAnchor(null); onMove(widget, -1); }}>
            <ListItemIcon><ArrowUpwardOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Move up" />
          </MenuItem>
        )}
        {onMove && (
          <MenuItem onClick={() => { setMenuAnchor(null); onMove(widget, +1); }}>
            <ListItemIcon><ArrowDownwardOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Move down" />
          </MenuItem>
        )}
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { setMenuAnchor(null); onDelete(widget); }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText primary="Delete widget" />
        </MenuItem>
      </Menu>

      <Box sx={{ flex: 1, p: 2, minHeight: 0, overflow: 'auto' }}>
        {STAT_TYPES.has(widget.type) && (
          <Stack sx={{ height: '100%' }} justifyContent="center" alignItems="center" spacing={1}>
            <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: accent }}><Icon /></Box>
            {/* Same rule as the dashboard tiles: a value we couldn't fetch
                shows as "—", never as a confident 0. */}
            <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {error ? '—' : loading ? '…' : formatWidgetValue(widget, value)}
            </Typography>
            {error && <Typography variant="caption" color="text.secondary">unavailable</Typography>}
            {widget.aggregation === 'mean' && <Typography variant="caption" color="text.secondary">Average in the latest time bucket</Typography>}
            {widget.type === 'gauge' && <LinearProgress variant="determinate" value={gaugeValue} color="inherit" sx={{ width: '80%', height: 8, borderRadius: 4, color: accent }} />}
          </Stack>
        )}
        {CHART_TYPES.has(widget.type) && (error ? <Typography role="alert">Could not load data. Try refreshing.</Typography> : loading ? <LinearProgress aria-label="Loading chart" /> : <TrendPreview series={series} type={widget.type} />)}
        {widget.type === 'table' && <TablePreview rows={snapshot?.recent_calls} fields={widget.fields} />}
        {isExplorer && (
          <InfluxMetricExplorer
            defaultMeasurement={widget.measurement} defaultField={widget.field}
            defaultAggregation={widget.aggregation} defaultMinutes={widget.minutes}
          />
        )}
        {updatedAt && <Typography variant="caption" color="text.secondary">Updated {new Date(updatedAt).toLocaleTimeString()}</Typography>}
      </Box>
    </Paper>
  );
}
