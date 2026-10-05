import { Chip, Tooltip } from '@mui/material';
import { useSessionRole } from '../../hooks/useIsUserSession';

// Which side is signed in, always visible in the top bar: both sessions share
// the same console, so without it an account and a user look alike.
const ROLES = {
  admin: { label: 'Admin', color: 'primary', hint: 'Signed in as an account (admin)' },
  user: { label: 'User', color: 'success', hint: 'Signed in as a user' },
};

const SessionRoleBadge = () => {
  const role = ROLES[useSessionRole()];
  if (!role) return null;
  return (
    <Tooltip title={role.hint}>
      <Chip
        data-testid="session-role-badge"
        label={role.label}
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
