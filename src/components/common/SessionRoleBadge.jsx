import { Chip, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSessionRole } from '../../hooks/useIsUserSession';

// Which side is signed in, always visible in the top bar: both sessions share
// the same console, so without it an account and a user look alike.
const ROLES = {
  admin: { labelKey: 'role.admin', hintKey: 'role.adminHint', color: 'primary' },
  user: { labelKey: 'role.user', hintKey: 'role.userHint', color: 'success' },
};

const SessionRoleBadge = () => {
  const { t } = useTranslation();
  const role = ROLES[useSessionRole()];
  if (!role) return null;
  return (
    <Tooltip title={t(role.hintKey)}>
      <Chip
        data-testid="session-role-badge"
        label={t(role.labelKey)}
        color={role.color}
        size="small"
        sx={{
          height: 20, flexShrink: 0, fontSize: '0.65rem', fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
    </Tooltip>
  );
};

export default SessionRoleBadge;
