import React, { useState } from 'react';
import { Box, Button, Paper, Stack, Typography, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import FlagIcon from '@mui/icons-material/Flag';
import DescriptionIcon from '@mui/icons-material/Description';
import TuneIcon from '@mui/icons-material/Tune';
import PaletteIcon from '@mui/icons-material/Palette';
import WidgetsIcon from '@mui/icons-material/Widgets';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import DownloadIcon from '@mui/icons-material/Download';
import RedisViewer from './RedisViewer.jsx';
import FeatureFlags from './FeatureFlags.jsx';
import SystemConfig from './SystemConfig.jsx';
import AppConfig, { YamlView } from './AppConfig.jsx';
import Appearance from './Appearance.jsx';
import screenReviewUrl from '../../../docs/uat/UAT-screens.xlsx?url';
import customerJourneyUrl from '../../../docs/uat/UAT-review.xlsx?url';
import fullRegressionUrl from '../../../docs/uat/UAT-v2.xlsx?url';

const UatDownloads = () => {
  const files = [
    {
      label: 'Screen review',
      detail: '37 simple usability checks, one per Admin or Portal screen.',
      href: screenReviewUrl,
      filename: 'Nimbus-UAT-screen-review.xlsx',
    },
    {
      label: 'Customer journey',
      detail: '10 checks from OTP sign-in through a registered phone and completed call.',
      href: customerJourneyUrl,
      filename: 'Nimbus-UAT-customer-journey.xlsx',
    },
    {
      label: 'Full regression',
      detail: 'The complete 128-check release regression workbook.',
      href: fullRegressionUrl,
      filename: 'Nimbus-UAT-full-regression.xlsx',
    },
  ];

  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)', mb: 2 }}>
        Internal release acceptance sheets. Download a fresh copy before each review and fill in its results locally.
      </Typography>
      <Stack spacing={1.5}>
        {files.map((file) => (
          <Paper
            key={file.filename}
            variant="outlined"
            sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{file.label}</Typography>
              <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)' }}>{file.detail}</Typography>
            </Box>
            <Button
              component="a"
              href={file.href}
              download={file.filename}
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              sx={{ flexShrink: 0, textTransform: 'none' }}
            >
              Download
            </Button>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

const ProvisioningCatalog = () => (
  <Box>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={1} sx={{ mb: 2 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>API-owned provisioning catalog</Typography>
        <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)' }}>
          The live <code>config/schemas.yaml</code> source used by provisioning wizards and operational reference.
        </Typography>
      </Box>
      <Button component="a" href="/schema" variant="outlined" size="small">Open provisioning wizard</Button>
    </Stack>
    <YamlView name="schemas" />
  </Box>
);

// Settings option views — add a new entry here and it appears in the sidebar.
const SECTIONS = [
  // First because it is the only section here that a non-engineer wants, and
  // because until now the console had no reachable theme toggle at all.
  {
    key: 'appearance',
    label: 'Appearance',
    description: 'Language and theme, remembered in this browser',
    icon: <PaletteIcon fontSize="small" />,
    component: Appearance,
  },
  {
    key: 'app-config',
    label: 'Config & Metrics',
    description: 'YAML config, runtime settings, Yabeda metrics',
    icon: <TuneIcon fontSize="small" />,
    component: AppConfig,
  },
  {
    key: 'features',
    label: 'Feature Flags',
    description: 'Per-user feature rollouts',
    icon: <FlagIcon fontSize="small" />,
    component: FeatureFlags,
  },
  {
    key: 'provisioning-catalog',
    label: 'Provisioning Catalog',
    description: 'View the live schemas.yaml definitions',
    icon: <WidgetsIcon fontSize="small" />,
    component: ProvisioningCatalog,
  },
  {
    key: 'system-config',
    label: 'System Config',
    description: 'View a node\'s va.yaml config',
    icon: <DescriptionIcon fontSize="small" />,
    component: SystemConfig,
  },
  {
    key: 'redis',
    label: 'Redis Viewer',
    description: 'Browse and inspect Redis keys',
    icon: <StorageIcon fontSize="small" />,
    component: RedisViewer,
  },
  {
    key: 'uat-downloads',
    label: 'UAT Downloads',
    description: 'Release review spreadsheets',
    icon: <FactCheckIcon fontSize="small" />,
    component: UatDownloads,
  },
];

/**
 * Settings — admin utility views, one section per tool (sidebar of option
 * views on the left, the selected view on the right). First resident: the
 * Redis Viewer, a general key browser (replaces the old Dashboard Data
 * Explorer / Redis-TS view).
 */
const Settings = () => {
  const [section, setSection] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return SECTIONS.some((item) => item.key === requested) ? requested : SECTIONS[0].key;
  });
  const active = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  const ActiveView = active.component;

  return (
    <Box sx={{ display: 'flex', gap: 2, p: { xs: 1, sm: 2, md: 3 }, height: '100%', overflow: 'hidden' }}>
      {/* Option views */}
      <Paper elevation={0} sx={{ width: 240, flexShrink: 0, border: '1px solid var(--mui-palette-divider)', borderRadius: 2, overflow: 'auto' }}>
        <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1, fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>
          Settings
        </Typography>
        <List dense>
          {SECTIONS.map((s) => (
            <ListItemButton key={s.key} selected={section === s.key} onClick={() => setSection(s.key)}>
              <ListItemIcon sx={{ minWidth: 34 }}>{s.icon}</ListItemIcon>
              <ListItemText primary={s.label} secondary={s.description}
                primaryTypographyProps={{ sx: { fontWeight: section === s.key ? 600 : 400 } }}
                secondaryTypographyProps={{ sx: { fontSize: 11 } }} />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      {/* Active view */}
      <Paper elevation={0} sx={{ flexGrow: 1, border: '1px solid var(--mui-palette-divider)', borderRadius: 2, p: 2, overflow: 'auto' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{active.label}</Typography>
        <ActiveView />
      </Paper>
    </Box>
  );
};

export default Settings;
