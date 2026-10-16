import { severity } from '../theme/tokens';

/**
 * Shared log formatting helpers used by both the Events and SystemLogs screens.
 *
 * Keep this module pure JS (no React). Unifies:
 *   - Severity colour palettes (Datadog/Grafana style)
 *   - Period quick-select computation
 *   - Chart time-interval derivation
 *   - Aggregate-to-histogram conversion
 *   - Relative/absolute time formatting
 */

/**
 * Level severity config — canonical event-store levels plus syslog aliases.
 * Each entry exposes `{ color, bg, label }`.
 */
// Severity colours live in src/theme/tokens.js and reach the page as MUI CSS
// variables (`--mui-palette-severity-<level>-color|bg`), which flip with dark
// mode. These strings work anywhere CSS does (sx, style); SVG presentation
// attributes need a real colour — use `severityHex` for those.
const v = (lvl, part) => `var(--mui-palette-severity-${lvl}-${part})`;
const lvlCfg = (lvl, label) => ({ color: v(lvl, 'color'), bg: v(lvl, 'bg'), label });
export const LEVEL_CONFIG = {
  crit:  lvlCfg('crit', 'CRIT'),
  error: lvlCfg('error', 'ERROR'),
  warn:  lvlCfg('warn', 'WARN'),
  info:  lvlCfg('info', 'INFO'),
  debug: lvlCfg('debug', 'DEBUG'),
  trace: lvlCfg('trace', 'TRACE'),
  err:       lvlCfg('error', 'ERR'),
  warning:   lvlCfg('warn', 'WARNING'),
  notice:    lvlCfg('notice', 'NOTICE'),
  emerg:     lvlCfg('emerg', 'EMERG'),
  emergency: lvlCfg('emerg', 'EMERGENCY'),
  alert:     lvlCfg('alert', 'ALERT'),
  critical:  lvlCfg('crit', 'CRITICAL'),
};

/** Light-scheme hex for a level, for SVG attributes that cannot take var(). */
export const severityHex = (level) => (severity.light[level] || severity.light.info).color;

/**
 * Return the `{ text, bg }` shape the Events DataGrid renderCell expects.
 * Falls back to the `info` palette when the level is unknown.
 */
export const getSeverityChipColors = (level) => {
  const key = String(level || 'info').toLowerCase();
  const cfg = LEVEL_CONFIG[key] || LEVEL_CONFIG.info;
  return { text: cfg.color, bg: cfg.bg };
};

/**
 * Canonical ordering of severities for dropdown menus.
 */
export const SEVERITY_ORDER = [
  'emerg',
  'alert',
  'crit',
  'error',
  'warning',
  'notice',
  'info',
  'debug',
  'trace',
];

/**
 * Map a raw syslog severity into a canonical bucket used by the metrics pills.
 *   err            → error
 *   warning        → warn
 *   emerg/alert    → crit
 *   critical       → crit
 * Unknown values are returned lowercased, unchanged.
 */
export const normalizeSeverityKey = (sev) => {
  const key = String(sev || '').toLowerCase();
  if (key === 'err') return 'error';
  if (key === 'warning') return 'warn';
  if (key === 'emerg' || key === 'emergency' || key === 'alert' || key === 'critical') return 'crit';
  return key;
};

/**
 * Auto-refresh interval options (seconds).
 * `0` means auto-refresh disabled.
 */
export const AUTO_REFRESH_OPTIONS = [
  { value: 0,  label: 'Off' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

/**
 * Parse a time value coming from the API. Accepts:
 *   - ISO 8601 string  (e.g. "2026-04-08T09:02:15.535")
 *   - unix seconds     (number or numeric string < 13 digits)
 *   - unix millis      (number or numeric string ≥ 13 digits)
 *   - Date instance
 * Returns a Date, or null if the input is unparseable.
 */
export const parseLogTime = (time) => {
  if (time == null || time === '') return null;
  if (time instanceof Date) return isNaN(time.getTime()) ? null : time;
  const str = String(time).trim();
  if (/^\d+$/.test(str)) {
    const n = Number(str);
    const ms = str.length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  // Server timestamps are UTC. A bare "YYYY-MM-DD HH:MM:SS" (no Z / no ±offset)
  // is parsed as LOCAL by JS, which makes fresh events read "3h ago" on a
  // UTC+3 client. Detect a tz-less datetime and pin it to UTC.
  let norm = str;
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(str);
  if (!hasTz && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(str)) {
    norm = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(norm);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Render a time as a human-friendly relative string: `just now`, `12s ago`,
 * `3m ago`, etc. Dates older than a week fall back to `YYYY-MM-DD`.
 */
export const formatRelative = (time) => {
  const date = parseLogTime(time);
  if (!date) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5)        return 'just now';
  if (diffSec < 60)       return `${diffSec}s ago`;
  if (diffSec < 3600)     return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400)    return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Render a time as an absolute string with millisecond precision:
 * `YYYY-MM-DD HH:MM:SS.mmm`.
 */
export const formatAbsolute = (time) => {
  const date = parseLogTime(time);
  if (!date) return '';
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
         `${pad(date.getMilliseconds(), 3)}`;
};

/**
 * Convert a server aggregate response
 *   [{ time, severity_a: n, severity_b: m, ... }]
 * into the format TimeHistogram expects:
 *   [{ time: Date, total, severities: { severity_a: n, ... } }]
 * Drops buckets whose `time` fails to parse.
 */
export const convertAggregateToHistogramFormat = (aggregateData) => {
  if (!Array.isArray(aggregateData) || aggregateData.length === 0) return [];
  return aggregateData
    .map((bucket) => {
      const { time, ...groups } = bucket;
      const severities = {};
      let total = 0;
      Object.entries(groups).forEach(([key, count]) => {
        const n = Number(count) || 0;
        if (n > 0) {
          severities[String(key).toLowerCase()] = n;
          total += n;
        }
      });
      // The API's buckets are naive UTC ("2026-10-15T22:00:00", no offset);
      // new Date() would read that as LOCAL time and draw a 22:00 UTC call at
      // 19:00 GMT in Israel. A time with no zone is UTC.
      const iso = typeof time === 'string' && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(time) ? `${time}Z` : time;
      const parsed = time instanceof Date ? time : new Date(iso);
      return { time: parsed, total, severities };
    })
    .filter((b) => b.time && !isNaN(b.time.getTime()));
};

/**
 * Period tokens supported by `computePeriodRange`.
 */
export const PERIOD_OPTIONS = ['15m', '1h', '3h', '6h', '24h', '7d', '30d'];

/**
 * Compute `{ start, end, period }` for a quick-select period token.
 * Falls back to `1h` for unknown tokens.
 */
export const computePeriodRange = (period) => {
  const now = new Date();
  let start;
  switch (period) {
    case '15m':
      start = new Date(now.getTime() - 15 * 60 * 1000);
      break;
    case '1h':
      start = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '3h':
      start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      break;
    case '6h':
      start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      break;
    case '24h':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getTime() - 60 * 60 * 1000);
      return { start, end: now, period: '1h' };
  }
  return { start, end: now, period };
};

/**
 * Derive the appropriate chart bucket size for the active time range.
 * Mirrors the Events / SystemLogs legacy heuristics:
 *   ≤ 3h  → minute
 *   ≤ 48h → hour
 *   else  → day
 */
export const deriveChartInterval = (start, end) => {
  if (!start || !end) return 'hour';
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return 'hour';
  const diffHours = (endMs - startMs) / 3_600_000;
  if (diffHours <= 3) return 'minute';
  if (diffHours <= 48) return 'hour';
  return 'day';
};
