import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { HEALTH_COLORS, checkLevel, overallHealth } from '../TopBar/healthLevel';

const LEVEL_TEXT = { healthy: 'Healthy', degraded: 'Degraded', down: 'Down', checking: 'Checking…' };
const title = (name) => name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The API's health, one row per service from /health?verbose. A row opens the
 * verbose (detailed) health for that service. An API that reports no
 * per-service checks still gets one row: the API as a whole.
 */
export default function HealthList({ health, gatusSummary, onOpen }) {
  const checks = Object.entries(health?.checks || {});
  const overall = overallHealth(health, gatusSummary);
  const rows = checks.length
    ? checks.map(([name, check]) => {
      const level = checkLevel(check);
      const detail = level === 'down'
        ? (check?.error || 'check failed')
        : [check?.ms != null && `${check.ms}ms`, check?.used_percent != null && `${check.used_percent}% used`, check?.server].filter(Boolean).join(' · ');
      return { name, label: title(name), level, detail };
    })
    : [{ name: 'api', label: 'API', level: overall.level, detail: overall.reason }];

  return (
    <Box data-testid="health-list">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <CircleIcon sx={{ fontSize: 12, color: HEALTH_COLORS[overall.level] }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Health</Typography>
        <Typography variant="caption" color="text.secondary">{LEVEL_TEXT[overall.level]} — {overall.reason}</Typography>
      </Box>
      <List dense disablePadding>
        {rows.map((row) => (
          <ListItemButton key={row.name} onClick={() => onOpen(row.name)} aria-label={`${row.label} health details`} sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 24 }}>
              <CircleIcon sx={{ fontSize: 10, color: HEALTH_COLORS[row.level] }} />
            </ListItemIcon>
            <ListItemText
              primary={row.label}
              secondary={row.detail || LEVEL_TEXT[row.level]}
              primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
            <Typography variant="caption" sx={{ color: HEALTH_COLORS[row.level], fontWeight: 600, mr: 0.5 }}>{LEVEL_TEXT[row.level]}</Typography>
            <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
