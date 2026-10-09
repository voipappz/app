import { Tabs } from '@mui/material';

// Shared navigation for report categories and Calls / Messages.
export default function SectionTabs({ sx, ...props }) {
  return (
    <Tabs
      variant="scrollable"
      scrollButtons="auto"
      textColor="inherit"
      {...props}
      sx={[
        {
          flexShrink: 0,
          borderBottom: '1px solid var(--mui-palette-divider)',
          '& .MuiTab-root': {
            color: 'var(--mui-palette-text-secondary)',
            textTransform: 'capitalize',
            '&.Mui-selected': { color: 'var(--mui-palette-primary-main)' },
          },
          '& .MuiTabs-indicator': { backgroundColor: 'var(--mui-palette-primary-main)' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
