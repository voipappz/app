import { Paper, Tab } from '@mui/material';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import SectionTabs from '../SectionTabs.jsx';
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

const LogTabs = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { canAccess } = usePermissions();
  const { t } = useTranslation();

  const tabs = LOG_TABS.filter((tab) => canAccess(tab.aclKey));
  // One kind only: there is nothing to switch to.
  if (tabs.length < 2) return null;

  const current = tabs.find((tab) => pathname.startsWith(tab.path))?.path || false;

  return (
    <Paper sx={{ mb: 1, flexShrink: 0, backgroundColor: 'var(--mui-palette-background-paper)', border: '1px solid var(--mui-palette-divider)', borderRadius: 2 }}>
    <SectionTabs
      value={current}
      onChange={(_, path) => navigate(path)}
      aria-label={t('nav:logs')}
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.path}
          value={tab.path}
          label={t(tab.labelKey)}
          icon={tab.aclKey === 'calls' ? <PhoneInTalkIcon /> : <MessageOutlinedIcon />}
          iconPosition="start"
        />
      ))}
    </SectionTabs>
    </Paper>
  );
};

export default LogTabs;
