import { Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { statusColor, statusLabel } from './statusColors';

/**
 * StatusChip — renders any call/agent status as a themed chip using the shared
 * status→color map. Use everywhere a status is shown (Calls table, Dashboard,
 * Reports) so colors stay consistent. Labels are localized via the shared
 * `usageReports.status.*` keys; unknown statuses fall back to Title Case.
 */
export default function StatusChip({ status, size = 'small', variant = 'filled', ...rest }) {
  const { t } = useTranslation();
  const key = String(status || '').toLowerCase();
  const label = t(`usageReports.status.${key}`, statusLabel(status));
  return (
    <Chip
      size={size}
      variant={variant}
      color={statusColor(status)}
      label={label}
      sx={{
        // Match nimbus-admin chip design: compact, rounded, medium weight.
        height: 24,
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.02em',
        ...rest.sx,
      }}
      {...rest}
    />
  );
}
