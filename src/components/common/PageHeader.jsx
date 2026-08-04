import { Box, Typography } from '@mui/material';

/**
 * PageHeader — consistent page title block: title + optional subtitle on the
 * left, an actions slot (and/or a live-status chip) on the right. RTL-safe.
 */
export default function PageHeader({ title, subtitle, actions, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 1.5,
        mb: 3,
        ...sx,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        // Wraps on a phone: a fixed `flexShrink: 0` row of chips and buttons is
        // exactly what pushes a 360px page into a horizontal scroll.
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flexShrink: { xs: 1, sm: 0 }, maxWidth: '100%' }}>
          {actions}
        </Box>
      )}
    </Box>
  );
}
