import { useMemo } from 'react';
import { Box, Paper, Typography, Chip, Table, TableHead, TableBody, TableRow, TableCell, Link } from '@mui/material';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import { useTranslation } from 'react-i18next';
import { useDashboardLive } from '../useDashboardLive';

/**
 * DashboardWidgets — renders the live dashboard exactly as the cable stream
 * sends it. The portal's "widget logic" lives here (columns / types / icons /
 * grid), but ALL fetching/structure resolution is done by va-crystal (it reads
 * the voipappz-api dashboard + Redis and streams ready-to-render widgets). React
 * is a pure renderer: it displays whatever widget descriptors arrive, as-is.
 *
 * Widget descriptor (per `widget.model.ts`), keyed by uuid in the stream payload:
 *   { type:'table'|'counter', title?, header_icon?, header_background_color?,
 *     header_text_color?, row?, col?, sizeX?, sizeY?,
 *     columns?:[{ name, header_name?, type?, icon?, display? }],
 *     table?:[{ uuid, <name>:value }], value? }
 * Crystal may send only `{type:'table', table:[…]}` today — columns are then
 * derived from the row keys, so the panel renders before the richer descriptor lands.
 */

// status/state value → semantic color (Identity::User.color? in voipappz-api).
const VALUE_COLOR = {
  available: 'success', answer: 'success', in_a_queue_call: 'success', waiting: 'success',
  ringing: 'warning', on_break: 'warning', receiving: 'warning', logged_out: 'info',
};

const humanize = (k) => String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Infer a column type from its field name so a fields-only stream (no rich
// `columns`) still formats nicely (chips for status/state, mm:ss for duration…).
function inferType(name) {
  if (name === 'status' || name === 'state' || name === 'call_state') return name === 'call_state' ? 'state' : name;
  if (/duration/.test(name)) return 'duration';
  if (/_at$|_time$/.test(name)) return 'timestamp';
  if (/_count$|_counter$|_second$/.test(name)) return 'number';
  return undefined;
}

function fmtDuration(v) {
  const s = Number(v);
  if (!Number.isFinite(s)) return String(v);
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// Derive column descriptors from a table widget: prefer the stream's `columns`,
// else build them from the union of row keys (minus the internal `uuid`).
function useColumns(widget) {
  return useMemo(() => {
    // 1) rich `columns` descriptor (header_name/type/icon) wins.
    if (Array.isArray(widget.columns) && widget.columns.length) {
      return widget.columns.filter((c) => c.display !== false).map((c) => ({
        name: c.name, label: c.header_name || c.label || humanize(c.name), type: c.type || inferType(c.name), icon: c.icon,
      }));
    }
    // 2) the cable stream's ordered `fields` (column ORDER from the API).
    if (Array.isArray(widget.fields) && widget.fields.length) {
      return widget.fields.map((name) => ({ name, label: humanize(name), type: inferType(name) }));
    }
    // 3) last resort: derive from row keys.
    const keys = new Set();
    (widget.table || []).forEach((r) => Object.keys(r).forEach((k) => k !== 'uuid' && keys.add(k)));
    return [...keys].map((name) => ({ name, label: humanize(name), type: inferType(name) }));
  }, [widget]);
}

function CellValue({ col, value, t }) {
  if (value == null || value === '') return <Typography variant="body2" color="text.disabled">—</Typography>;
  switch (col.type) {
    case 'status':
    case 'state':
      return <Chip size="small" label={t(`dashboardLive.value.${value}`, humanize(value))} color={VALUE_COLOR[value] || 'default'} variant="outlined" />;
    case 'duration':
      return <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(value)}</Typography>;
    case 'timestamp':
      return <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{new Date(isNaN(value) ? value : Number(value) * 1000).toLocaleTimeString()}</Typography>;
    case 'url':
      return <Link href={String(value)} target="_blank" rel="noopener" underline="hover">{String(value)}</Link>;
    default:
      return <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }} noWrap>{String(value)}</Typography>;
  }
}

function TableWidget({ widget, t }) {
  const cols = useColumns(widget);
  const rows = widget.table || [];
  if (!rows.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>{t('dashboardLive.empty', 'No rows')}</Typography>;
  }
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {cols.map((c) => (
              <TableCell key={c.name} sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}>{c.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.uuid || i} hover>
              {cols.map((c) => (
                <TableCell key={c.name} sx={{ whiteSpace: 'nowrap' }}><CellValue col={c} value={r[c.name]} t={t} /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function CounterWidget({ widget }) {
  return (
    <Typography variant="h3" sx={{ fontWeight: 800, textAlign: 'center', py: 2, fontVariantNumeric: 'tabular-nums' }}>
      {widget.value ?? '—'}
    </Typography>
  );
}

function WidgetCard({ widget, t }) {
  // Honor the portal's grid placement when the stream provides it; otherwise
  // default to full width (a lone table shouldn't collapse to 1/12).
  const gridSx = (widget.col && widget.sizeX)
    ? { gridColumn: `${widget.col} / span ${widget.sizeX}`, gridRow: widget.row ? `${widget.row} / span ${widget.sizeY || 1}` : undefined }
    : { gridColumn: '1 / -1' };
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', ...gridSx }}>
      <Box sx={{
        px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1,
        bgcolor: widget.header_background_color || 'transparent',
        color: widget.header_text_color || 'text.primary',
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }} noWrap>
          {widget.title || t('dashboardLive.title', 'Live')}
        </Typography>
      </Box>
      <Box sx={{ p: widget.type === 'table' ? 1.5 : 2 }}>
        {widget.type === 'counter' ? <CounterWidget widget={widget} /> : <TableWidget widget={widget} t={t} />}
      </Box>
    </Paper>
  );
}

export default function DashboardWidgets({ hideHeading = false }) {
  const { t } = useTranslation();
  const { widgets, status } = useDashboardLive();
  // Stream payload is a { uuid: descriptor } map — render in arrival order.
  const entries = useMemo(() => Object.entries(widgets), [widgets]);
  const live = status === 'open';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: hideHeading ? 'flex-end' : 'space-between', mb: 1.5 }}>
        {!hideHeading && <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('dashboardLive.heading', 'Live dashboard')}</Typography>}
        <Chip
          size="small" icon={<RadioButtonCheckedIcon fontSize="small" />}
          label={live ? t('callDashboard.live', 'live') : status}
          color={live ? 'success' : 'warning'} variant={live ? 'filled' : 'outlined'}
        />
      </Box>
      {entries.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {t('dashboardLive.waiting', 'Waiting for the live dashboard stream from cable…')}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' } }}>
          {entries.map(([uuid, widget]) => <WidgetCard key={uuid} widget={widget} t={t} />)}
        </Box>
      )}
    </Box>
  );
}
