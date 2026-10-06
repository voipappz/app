import { Tabs, Tab } from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import { usePermissions } from '../../../hooks/usePermissions';

// Calls and Messages are one screen, "Logs": the same list of what went
// through the switch, by kind. Each kind keeps its own route (links, ACL and
// the docked search stay per kind); these tabs are how you move between them.
export const LOG_TABS = [
  { label: 'Calls', path: '/calls', aclKey: 'calls' },
  { label: 'Messages', path: '/messages', aclKey: 'messages' },
];

const LogTabs = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { canAccess } = usePermissions();

  const tabs = LOG_TABS.filter((tab) => canAccess(tab.aclKey));
  // One kind only: there is nothing to switch to.
  if (tabs.length < 2) return null;

  const current = tabs.find((tab) => pathname.startsWith(tab.path))?.path || false;

  return (
    <Tabs
      value={current}
      onChange={(_, path) => navigate(path)}
      aria-label="Logs"
      sx={{
        flexShrink: 0,
        minHeight: 30,
        mb: 0.5,
        borderBottom: '1px solid var(--theme-border)',
        '& .MuiTab-root': {
          minHeight: 30,
          minWidth: 0,
          px: 1.5,
          py: 0,
          textTransform: 'none',
          fontSize: '0.8rem',
          fontWeight: 600,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tab key={tab.path} value={tab.path} label={tab.label} />
      ))}
    </Tabs>
  );
};

export default LogTabs;
