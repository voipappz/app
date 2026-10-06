import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Call as CallIcon,
  QrCode2 as QrCodeIcon,
  RssFeed as RssFeedIcon,
} from '@mui/icons-material';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import EntityLink from '../common/EntityLink/EntityLink.jsx';
import Bdi from '../../i18n/Bdi';
import { orEmpty } from '../shared/tableTheme.jsx';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps } from '../../utils/chipStyles';

// The devices table, described for ResponsiveTable. On a phone each device is a
// card: the SIP username is the headline, the name under it, status values
// below, and the row's buttons at the bottom. Dates are desktop only.
export function buildExtensionColumns({ t, registeredUsers, canWrite, canEditEnv, loading, actions }) {
  return [
    {
      id: 'created_at', label: t('table.createdAt'), sortable: true, priority: 'desktopOnly',
      render: (extension) => <Typography variant="body2">{formatDate(extension.created_at)}</Typography>,
    },
    {
      id: 'updated_at', label: t('table.updatedAt'), sortable: true, priority: 'desktopOnly',
      render: (extension) => <Typography variant="body2">{formatDate(extension.updated_at)}</Typography>,
    },
    {
      id: 'registration', align: 'center', width: 50, priority: 'meta',
      label: <Tooltip title={t('table.registrationStatus')}><RssFeedIcon fontSize="small" /></Tooltip>,
      cardLabel: t('table.registration'),
      render: (extension) => <RegistrationStatus t={t} extension={extension} registeredUsers={registeredUsers} />,
    },
    {
      id: 'enabled', label: t('table.enabled'), sortable: true, align: 'center', priority: 'meta',
      render: (extension) => <Chip {...getEnabledChipProps(extension.enabled)} />,
    },
    {
      id: 'username', label: t('table.device'), sortable: true, priority: 'primary',
      render: (extension) => (
        <Typography variant="body2" fontWeight={600}>
          {extension.username ? <Bdi>{extension.username}</Bdi> : orEmpty(extension.username)}
        </Typography>
      ),
    },
    {
      id: 'name', label: t('table.name'), sortable: true, priority: 'secondary',
      render: (extension) => <Typography variant="body2">{orEmpty(extension.name)}</Typography>,
    },
    {
      id: 'application', label: t('table.application'), priority: 'meta',
      render: (extension) => (
        <EntityLink
          name={extension.environment?.name}
          ariaLabel={t('table.editApplication', { name: extension.environment?.name || '' })}
          onEdit={extension.environment?.uuid && canEditEnv ? () => actions.onEditApplication(extension.environment) : undefined}
        />
      ),
    },
    {
      id: 'tags', label: t('table.tags'), priority: 'meta',
      render: (extension) => <MetaTagChips meta={extension.meta} />,
    },
    {
      id: 'actions', label: t('table.actions'), align: 'center', priority: 'action',
      render: (extension) => (
        <ExtensionRowActions t={t} extension={extension} canWrite={canWrite} loading={loading} actions={actions} />
      ),
    },
  ];
}

// The SIP registration icon. Its tooltip lists the switch-side detail (user
// agent, contact, IP...) the API attaches to each row for exactly this purpose
// (registration_info() in endpoints/extensions.rb).
function RegistrationStatus({ t, extension, registeredUsers }) {
  const isRegistered = extension.switch === true || registeredUsers.has(extension.username);
  const reg = extension.registration;
  const detail = reg && [
    [t('registration.userAgent'), reg.user_agent],
    [t('registration.contact'), reg.contact && <Bdi>{reg.contact}</Bdi>],
    [t('registration.ip'), [reg.network_ip, reg.network_port].filter(Boolean).join(':') && (
      <Bdi>{[reg.network_ip, reg.network_port].filter(Boolean).join(':')}</Bdi>
    )],
    [t('registration.proto'), reg.network_proto],
    [t('registration.host'), reg.hostname],
    [t('registration.expires'), reg.expires],
  ].filter(([, value]) => value);

  const title = !isRegistered ? t('registration.offline')
    : detail && detail.length ? (
      <Box sx={{ py: 0.25 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, mb: 0.25 }}>{t('registration.online')}</Typography>
        {detail.map(([label, value]) => (
          <Typography key={label} sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{label}: {value}</Typography>
        ))}
      </Box>
    ) : t('registration.online');

  return (
    <Tooltip title={title}>
      <RssFeedIcon fontSize="small" sx={{ color: isRegistered ? '#29AB87' : '#ccc', cursor: 'default' }} />
    </Tooltip>
  );
}

// The row's buttons. Clicks stay here: they must not also select the row.
function ExtensionRowActions({ t, extension, canWrite, loading, actions }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }} onClick={(event) => event.stopPropagation()}>
      <Tooltip title={t('action.openPhone')}>
        <IconButton data-testid="phone-extension-button" size="small" onClick={() => actions.onOpenPhone(extension)} disabled={loading} color="primary">
          <PhoneIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('action.clickToCall')}>
        <IconButton data-testid="click2call-extension-button" size="small" onClick={() => actions.onClickToCall(extension)} disabled={loading} color="success">
          <CallIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('action.showQrCode')}>
        <IconButton data-testid="qrcode-extension-button" size="small" onClick={() => actions.onShowQrCode(extension)} disabled={loading}>
          <QrCodeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {canWrite && (
        <Tooltip title={t('action.edit')}>
          <IconButton data-testid="edit-extension-button" size="small" onClick={() => actions.onEdit(extension)} disabled={loading}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <RowEventsButton subject="extension" uuid={extension.uuid} />
      {canWrite && (
        <Tooltip title={t('action.delete')}>
          <IconButton data-testid="delete-extension-button" size="small" onClick={() => actions.onDelete(extension)} disabled={loading} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
