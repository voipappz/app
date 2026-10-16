import { Box, Typography, Tooltip } from '@mui/material';

/**
 * One headline number with its label — the Calls counters and the dashboard's
 * number widgets are this one component.
 *
 * `variant`:
 *  - 'card'    a bordered tile (dashboard): the number large, in its colour.
 *  - 'compact' a single-line number and label with a selected outline (Calls).
 *  - 'minimal' no box: a colour underline marks the active one.
 *  - 'tile'    a rounded card with a soft shadow, a tinted icon, the number
 *              large and the label under it (Calls, above the list). A zero
 *              is muted: "nothing" should not shout in red or green.
 *
 * Clickable when `onClick` is given (Calls toggles the matching filter — the
 * same `search[call.*]` param the filter pills read).
 *
 * `value == null` means "we don't know" (loading, nothing in scope, or the
 * request failed) and renders "—". It must never render 0: the Calls screen
 * once showed a confident "0 Total" next to a chart with 16 calls because a
 * failure degraded silently into a number.
 */
const StatCounter = ({ label, value, color = 'var(--counter-total)', active = false, onClick, tooltip, variant = 'card', icon = null }) => {
  const known = value != null && value !== '';
  if (variant === 'tile') return <Tile {...{ label, value, color, active, onClick, tooltip, icon, known }} />;
  const minimal = variant === 'minimal';
  const compact = variant === 'compact';

  const card = (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      } : undefined}
      sx={compact ? {
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        px: 1, py: 0.5, minHeight: 32, boxSizing: 'border-box', borderRadius: 1,
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        bgcolor: active ? 'var(--accent-primary-alpha-8)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'var(--accent-primary)' : 'transparent',
        transition: 'background-color .12s, border-color .12s',
        '&:hover': onClick ? {
          bgcolor: 'var(--theme-hover)',
        } : undefined,
        '&:focus-visible': { outline: '2px solid var(--accent-primary)', outlineOffset: 2 },
      } : minimal ? {
        px: 1, pt: 0.25, pb: 0.5, minWidth: 64,
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        borderBottom: '2px solid', borderColor: active ? color : 'transparent',
        transition: 'border-color .12s',
        '&:hover': onClick ? { borderColor: active ? color : 'var(--theme-border)' } : undefined,
        '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
      } : {
        px: 2, py: 1.25, minWidth: 110, borderRadius: 1.5,
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        // `color` is a theme-aware CSS var (--counter-*), so it can't be
        // string-concatenated into an alpha; the active tint is --theme-hover
        // and the colour carries in the border and the number. Idle keeps a
        // hairline border so selecting one doesn't shift the row.
        bgcolor: active ? 'var(--theme-hover)' : 'transparent',
        border: '1px solid', borderColor: active ? color : 'var(--theme-border)',
        transition: 'background-color .12s, border-color .12s',
        '&:hover': onClick ? { bgcolor: 'var(--theme-hover)', borderColor: color } : undefined,
        '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
      }}
    >
      <Typography sx={{
        fontSize: compact ? '0.95rem' : minimal ? '1.1rem' : '1.75rem', fontWeight: 700, lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: known ? (compact ? 'var(--theme-text-primary)' : color) : 'var(--theme-text-secondary)',
      }}>
        {known ? value : '—'}
      </Typography>
      <Typography sx={{
        fontSize: compact ? '0.75rem' : minimal ? '0.6rem' : '0.66rem', fontWeight: compact ? 500 : 600, letterSpacing: compact ? 0 : '0.05em',
        textTransform: compact ? 'none' : 'uppercase', color: 'var(--theme-text-secondary)', lineHeight: 1.4, whiteSpace: 'nowrap',
      }}>
        {label}
      </Typography>
    </Box>
  );

  const title = known ? tooltip : 'No data for the current selection';
  return title ? <Tooltip title={title}>{card}</Tooltip> : card;
};

function Tile({ label, value, color, active, onClick, tooltip, icon, known }) {
  const zero = known && Number(value) === 0;
  const tile = (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      aria-label={`${label}: ${known ? value : 'no data'}`}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      } : undefined}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, minWidth: 0,
        borderRadius: '16px', cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        bgcolor: 'var(--theme-bg-primary)',
        border: '1px solid', borderColor: active ? color : 'var(--theme-border)',
        boxShadow: active ? '0 4px 14px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow .15s, border-color .15s, transform .15s',
        '&:hover': onClick ? { boxShadow: '0 4px 14px rgba(0,0,0,0.10)', transform: 'translateY(-1px)' } : undefined,
        '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
      }}
    >
      {icon && (
        <Box sx={{
          position: 'relative', width: 40, height: 40, flexShrink: 0, borderRadius: '12px',
          display: 'grid', placeItems: 'center', color, overflow: 'hidden',
          // The tint is the colour itself at low opacity; `color` is a CSS var,
          // so it cannot be alpha-concatenated.
          '&::before': { content: '""', position: 'absolute', inset: 0, bgcolor: color, opacity: 0.12 },
          '& svg': { position: 'relative', fontSize: 22 },
        }}>
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontSize: '1.6rem', fontWeight: 650, lineHeight: 1.1,
          color: known && !zero ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
        }}>
          {known ? value : '—'}
        </Typography>
        <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--theme-text-secondary)' }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
  const title = known ? tooltip : 'No data for the current selection';
  return title ? <Tooltip title={title}>{tile}</Tooltip> : tile;
}

export default StatCounter;
