/**
 * How a widget definition turns into pixels — icon lookup, value formatting and
 * threshold colouring. Kept free of JSX so the dashboard (TSX), the builder and
 * the unit tests all share one source of truth.
 */
import CallIcon from '@mui/icons-material/Call';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import SpeedIcon from '@mui/icons-material/Speed';

export const WIDGET_ICONS = {
  Call: CallIcon,
  CallReceived: CallReceivedIcon,
  CallMade: CallMadeIcon,
  CheckCircle: CheckCircleOutlineIcon,
  PhoneMissed: PhoneMissedIcon,
  Timer: TimerOutlinedIcon,
  Speed: SpeedIcon,
  Insights: InsightsIcon,
};

export const ICON_NAMES = Object.keys(WIDGET_ICONS);

export function resolveIcon(name) {
  return WIDGET_ICONS[name] || InsightsIcon;
}

/** seconds → mm:ss (the dashboard's duration convention). */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A widget's raw metric value → the string on the tile. Durations render as
 * mm:ss (and never carry a unit suffix — the colon already says "time").
 */
export function formatWidgetValue(widget, value) {
  const raw = Number(value) || 0;
  if (/_sec$|duration/.test(widget?.metric || '')) return formatDuration(raw);
  const unit = (widget?.unit || '').trim();
  return unit ? `${raw} ${unit}` : String(raw);
}

/**
 * Threshold → tile accent. `inverse` flips the comparison for metrics where
 * LOW is bad (an SLA percentage). Returns the widget's own colour when no
 * threshold is crossed, so a plain counter keeps its template styling.
 */
export function thresholdColor(widget, value) {
  const { warning, critical } = widget?.thresholds || {};
  const raw = Number(value);
  const base = widget?.color || undefined;
  if (!Number.isFinite(raw)) return base;
  const worse = widget?.inverse ? (a, b) => a <= b : (a, b) => a >= b;
  if (Number.isFinite(critical) && worse(raw, critical)) return 'error.main';
  if (Number.isFinite(warning) && worse(raw, warning)) return 'warning.main';
  return base;
}

/** Value → 0..100 fill for a gauge, clamped to the widget's min/max. */
export function gaugePercent(widget, value) {
  const min = Number(widget?.min) || 0;
  const max = Number.isFinite(Number(widget?.max)) ? Number(widget.max) : 100;
  if (max <= min) return 0;
  const raw = Number(value) || 0;
  return Math.min(100, Math.max(0, ((raw - min) / (max - min)) * 100));
}
