import { Box, Tab, Tabs, Typography } from '@mui/material';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../../hooks/usePermissions';

// Calls and Messages are one screen, "Logs": the same list of what went
// through the switch, by kind. Each kind keeps its own route (links, ACL and
// the docked search stay per kind); these tabs are how you move between them.
export const LOG_TABS = [
  { label: 'Calls', labelKey: 'nav:calls', path: '/calls', aclKey: 'calls' },
  { label: 'Messages', labelKey: 'nav:messages', path: '/messages', aclKey: 'messages' },
];

// The page header: the kind you are looking at as the title, and a small pill
// switch beside it. It used to be a full-width tab card, a whole row of the
// screen spent on a two-way choice.
const LogTabs = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { canAccess } = usePermissions();
  const { t } = useTranslation();

  const tabs = LOG_TABS.filter((tab) => canAccess(tab.aclKey));
  const currentTab = tabs.find((tab) => pathname.startsWith(tab.path));
  const current = currentTab?.path || false;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, mt: 0.5, flexShrink: 0, flexWrap: 'wrap' }}>
      {currentTab && (
        <Typography component="h1" sx={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--theme-text-primary)', lineHeight: 1.2 }}>
          {t(currentTab.labelKey)}
        </Typography>
      )}
      {/* One kind only: there is nothing to switch to. */}
      {tabs.length > 1 && (
        <Tabs
          value={current}
          onChange={(_, path) => navigate(path)}
          aria-label={t('nav:logs')}
          TabIndicatorProps={{ sx: { display: 'none' } }}
          sx={{
            minHeight: 0,
            p: 0.5,
            borderRadius: 999,
            bgcolor: 'var(--theme-bg-secondary)',
            border: '1px solid var(--theme-border)',
            '& .MuiTabs-flexContainer': { gap: 0.5 },
            '& .MuiTab-root': {
              minHeight: 0, minWidth: 0, py: 0.6, px: 1.75, borderRadius: 999,
              textTransform: 'none', fontSize: '0.85rem', fontWeight: 600,
              color: 'var(--theme-text-secondary)',
              '& .MuiTab-iconWrapper': { fontSize: 18, mr: 0.75, ml: 0 },
              '&.Mui-selected': {
                color: 'var(--accent-primary)',
                bgcolor: 'var(--theme-bg-primary)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              },
            },
          }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.path}
              value={tab.path}
              label={t(tab.labelKey)}
              icon={tab.aclKey === 'calls' ? <PhoneInTalkIcon fontSize="inherit" /> : <MessageOutlinedIcon fontSize="inherit" />}
              iconPosition="start"
              disableRipple
            />
          ))}
        </Tabs>
      )}
    </Box>
  );
};

export default LogTabs;
