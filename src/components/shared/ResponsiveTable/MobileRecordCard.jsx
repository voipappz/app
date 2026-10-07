import { Box, Card, CardContent, Typography } from '@mui/material';

// One table row as a card on a phone. The columns' `priority` says where each
// value goes: `primary` is the headline, `secondary` the line under it, `meta`
// the small labelled values, `action` the buttons at the bottom. Columns
// marked `desktopOnly` are left out. `cardLabel` replaces a header that is
// only an icon, so the value still has a name on the card.
const byPriority = (columns, priority) => columns.filter((column) => (column.priority || 'meta') === priority);

export default function MobileRecordCard({ row, columns, selected, onClick }) {
  const cell = (column) => (column.render ? column.render(row) : row[column.id]);
  const [primary] = byPriority(columns, 'primary');
  const [secondary] = byPriority(columns, 'secondary');
  const meta = byPriority(columns, 'meta');
  const actions = byPriority(columns, 'action');

  return (
    <Card
      variant="outlined"
      onClick={onClick}
      data-testid="mobile-record-card"
      sx={{ mb: 1, cursor: onClick ? 'pointer' : 'default', borderColor: selected ? 'primary.main' : undefined }}
    >
      <CardContent sx={{ pb: actions.length ? 1 : 2 }}>
        {primary && <Typography variant="subtitle1" sx={{ fontWeight: 600 }} component="div">{cell(primary)}</Typography>}
        {secondary && <Typography variant="body2" color="text.secondary" component="div">{cell(secondary)}</Typography>}

        {meta.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 1 }}>
            {meta.map((column) => (
              <Box key={column.id} sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" component="div">{column.cardLabel ?? column.label}</Typography>
                <Typography variant="body2" component="div">{cell(column)}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {actions.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 1 }}>
            {actions.map((column) => <Box key={column.id}>{cell(column)}</Box>)}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
