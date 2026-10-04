import { Box, Card, CardContent, Typography } from '@mui/material';
import { byPriority, cellValue } from './columns';

/**
 * One record as a card, laid out from the columns' `priority`.
 *
 * Generic on purpose. Calls has a hand-written CallMobileCard with a country
 * flag, a direction arrow and a play button, and it should keep it — a screen
 * with a genuinely bespoke card passes `renderCard` to ResponsiveTable instead
 * of using this. This is the default that makes the other twenty-eight tables
 * convertible without designing twenty-eight cards.
 *
 * Layout:
 *
 *   ┌──────────────────────────────┐
 *   │ PRIMARY            (actions) │
 *   │ secondary                    │
 *   │ meta: a · meta: b · meta: c  │
 *   └──────────────────────────────┘
 */
const MobileRecordCard = ({ columns, row, onClick }) => {
  const primary = byPriority(columns, 'primary');
  const secondary = byPriority(columns, 'secondary');
  const meta = byPriority(columns, 'meta');
  const actions = byPriority(columns, 'action');

  const clickable = typeof onClick === 'function';

  return (
    <Card
      variant="outlined"
      // role/tabIndex/keyboard only when it actually does something — an
      // unclickable card announced as a button is worse than a plain one.
      {...(clickable ? {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
        },
      } : {})}
      sx={{
        mb: 1,
        cursor: clickable ? 'pointer' : 'default',
        '&:hover': clickable ? { borderColor: 'primary.main' } : undefined,
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {primary.map((c) => (
              <Typography
                key={c.id}
                sx={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {cellValue(c, row)}
              </Typography>
            ))}
            {secondary.map((c) => (
              <Typography
                key={c.id}
                variant="body2"
                color="text.secondary"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {cellValue(c, row)}
              </Typography>
            ))}
          </Box>
          {actions.length > 0 && (
            // stopPropagation so a button inside does not also open the card.
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}
            >
              {actions.map((c) => <Box key={c.id}>{cellValue(c, row)}</Box>)}
            </Box>
          )}
        </Box>

        {meta.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {meta.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                {/* The label is what a table gets from its header row; a card
                    has no header, so each value carries its own. */}
                {c.label && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {c.label}:
                  </Typography>
                )}
                <Typography component="span" variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cellValue(c, row)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default MobileRecordCard;
