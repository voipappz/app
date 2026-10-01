import { Box, Typography, Tooltip } from '@mui/material';

/**
 * One headline number with its label — the Calls counters and the dashboard's
 * number widgets are this one component.
 *
 * `variant`:
 *  - 'card'    a bordered tile (dashboard): the number large, in its colour.
 *  - 'minimal' no box (Calls, above the list): a colour underline marks the
 *              active one, so the row reads as a line of numbers, not buttons.
 *
 * Clickable when `onClick` is given (Calls toggles the matching filter — the
 * same `search[call.*]` param the filter pills read).
 *
 * `value == null` means "we don't know" (loading, nothing in scope, or the
 * request failed) and renders "—". It must never render 0: the Calls screen
 * once showed a confident "0 Total" next to a chart with 16 calls because a
 * failure degraded silently into a number.
 */
const StatCounter = ({ label, value, color = 'var(--counter-total)', active = false, onClick, tooltip, variant = 'card' }) => {
  const known = value != null && value !== '';
  const minimal = variant === 'minimal';

  const card = (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      } : undefined}
      sx={minimal ? {
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
        fontSize: minimal ? '1.1rem' : '1.75rem', fontWeight: 700, lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: known ? color : 'var(--theme-text-secondary)',
      }}>
        {known ? value : '—'}
      </Typography>
      <Typography sx={{
        fontSize: minimal ? '0.6rem' : '0.66rem', fontWeight: 600, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: 'var(--theme-text-secondary)', lineHeight: 1.4, whiteSpace: 'nowrap',
      }}>
        {label}
      </Typography>
    </Box>
  );

  const title = known ? tooltip : 'No data for the current selection';
  return title ? <Tooltip title={title}>{card}</Tooltip> : card;
};

export default StatCounter;
