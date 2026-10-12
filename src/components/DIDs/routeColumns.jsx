import { Box, ButtonBase, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  ContentCopy as DuplicateIcon,
  AccountTree as RoutingIcon,
} from '@mui/icons-material';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import EntityLink from '../common/EntityLink/EntityLink.jsx';
import Bdi from '../../i18n/Bdi';
import { orEmpty } from '../shared/tableTheme.jsx';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps, getTypeChipColor } from '../../utils/chipStyles';

// Bridge types whose name opens their editor from the list.
const EDITABLE_BRIDGES = ['ivr', 'queue', 'announcement', 'vml', 'call_condition', 'bot', 'workflow'];

const bridgeName = (did) => orEmpty(did.bridge?.name || did.bridge?.number);

/**
 * The Routes table, described for ResponsiveTable. On a phone each route is a
 * card: the number is the headline, the name under it, then status, type,
 * where calls go and the provider. A tap opens the route's details, so the
 * card carries no buttons: dates, application, tags and the row's actions are
 * desktop only. Values on a card are plain text, never a second tap target.
 */
export function buildRouteColumns({ portalMode, isPhone, loading, canWriteRoute, actions }) {
  return [
    {
      id: 'created_at', label: 'Created At', sortable: true, priority: 'desktopOnly',
      render: (did) => <Typography variant="body2">{formatDate(did.created_at)}</Typography>,
    },
    {
      id: 'updated_at', label: 'Updated At', sortable: true, priority: 'desktopOnly',
      render: (did) => <Typography variant="body2">{formatDate(did.updated_at)}</Typography>,
    },
    {
      id: 'enabled', label: 'Enabled', sortable: true, align: 'center', priority: 'meta',
      render: (did) => <Chip {...getEnabledChipProps(did.enabled)} />,
    },
    {
      id: 'name', label: 'Name', sortable: true, priority: 'secondary',
      render: (did) => (
        <Typography variant="body2" fontWeight={isPhone ? undefined : 600} component="span">{orEmpty(did.name)}</Typography>
      ),
    },
    // A portal user sees only their own environment: no column.
    ...(portalMode ? [] : [{
      id: 'environment_name', label: 'Application', sortable: true, priority: 'desktopOnly',
      render: (did) => (
        <EntityLink
          name={did.environment?.name || did.environment_name}
          ariaLabel={`Edit application ${did.environment?.name || did.environment_name || ''}`}
          onEdit={(did.environment?.uuid || did.environment_uuid) && canWriteRoute(did) ? () => actions.onEditApplication({
            uuid: did.environment?.uuid || did.environment_uuid,
            name: did.environment?.name || did.environment_name,
          }) : undefined}
        />
      ),
    }]),
    {
      id: 'type', label: 'Type', sortable: true, priority: 'meta',
      render: (did) => (
        <Chip label={did.type?.toUpperCase() || 'SIP'} size="small" color={getTypeChipColor(did.type || 'sip')} />
      ),
    },
    {
      id: 'number', label: 'Number', sortable: true, priority: 'primary',
      render: (did) => (isPhone
        ? <Bdi>{did.number}</Bdi>
        : <CallableNumber number={did.number} onCall={actions.onCall} />),
    },
    // Bridge is polymorphic (queue/ivr/announcement/...) — no single
    // server-side column to order by, so no sort here.
    {
      id: 'bridge', label: 'Bridge', cardLabel: 'Calls go to', priority: 'meta',
      render: (did) => <BridgeCell did={did} isPhone={isPhone} canWrite={canWriteRoute(did)} onEditBridge={actions.onEditBridge} />,
    },
    {
      id: 'provider', label: 'Provider', priority: 'meta',
      render: (did) => <ProviderCell provider={did.provider} clickable={!portalMode && !isPhone} onOpen={actions.onOpenProvider} />,
    },
    {
      id: 'tags', label: 'Tags', priority: 'desktopOnly',
      render: (did) => <MetaTagChips meta={did.meta} />,
    },
    {
      id: 'actions', label: 'Actions', align: 'center', priority: 'desktopOnly',
      render: (did) => (
        <RouteRowActions did={did} portalMode={portalMode} loading={loading} canWrite={canWriteRoute(did)} actions={actions} />
      ),
    },
  ];
}

// The number opens the phone with it (right-hand sidebar).
function CallableNumber({ number, onCall }) {
  return (
    <Tooltip title={`Call ${number}`}>
      <ButtonBase
        onClick={(e) => { e.stopPropagation(); onCall(number); }}
        aria-label={`Call ${number}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1, px: 0.5, mx: -0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <PhoneIcon fontSize="small" color="primary" />
        <Typography variant="body2" fontWeight={600}>
          <Bdi>{number}</Bdi>
        </Typography>
      </ButtonBase>
    </Tooltip>
  );
}

function BridgeCell({ did, isPhone, canWrite, onEditBridge }) {
  if (!did.bridge || !did.bridge_type || did.bridge_type === 'number') {
    return (
      <Typography variant="body2" color="text.secondary" component="span">
        {did.bridge_type === 'number' ? 'Number' : '-'}
      </Typography>
    );
  }
  if (isPhone) {
    return <Typography variant="body2" component="span">{bridgeName(did)}</Typography>;
  }
  // All bridge types except number support edit mode (write only).
  if (canWrite && EDITABLE_BRIDGES.includes(did.bridge_type)) {
    return (
      <Typography
        variant="body2"
        sx={{
          borderBottom: '1px dotted grey',
          cursor: 'pointer',
          display: 'inline-block',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          '&:hover': { color: 'primary.main' },
        }}
        onClick={(e) => { e.stopPropagation(); onEditBridge(did); }}
      >
        {bridgeName(did)}
      </Typography>
    );
  }
  return <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{bridgeName(did)}</Typography>;
}

function ProviderCell({ provider, clickable, onOpen }) {
  if (!provider) return <Typography variant="body2" color="text.secondary" component="span">-</Typography>;
  // The portal has no /providers screen to land on, and a card is one tap
  // target, so there the provider is just a label.
  return (
    <Chip
      label={provider.name}
      size="small"
      variant="outlined"
      onClick={clickable ? (e) => { e.stopPropagation(); onOpen(provider); } : undefined}
      sx={clickable
        ? { cursor: 'pointer', maxWidth: 120, '&:hover': { borderColor: 'primary.main' } }
        : { maxWidth: 120 }}
    />
  );
}

// The row's buttons. Clicks stay here: they must not also select the row.
function RouteRowActions({ did, portalMode, loading, canWrite, actions }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
      {canWrite && (
        // Admin edits a Route on the routing canvas. The portal opens the
        // wizard instead — a customer editing their own number wants the
        // fields, and reaches the canvas through the Routing action beside
        // this one when they want the flow.
        <Tooltip title={portalMode ? 'Edit Number' : 'Edit Route — opens its visual routing flow'}>
          <IconButton data-testid="edit-did-button" size="small" onClick={() => actions.onEdit(did)} disabled={loading}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canWrite && portalMode && (
        <Tooltip title="Call routing — visual flow">
          <IconButton data-testid="routing-did-button" size="small" onClick={() => actions.onOpenFlow(did)} disabled={loading}>
            <RoutingIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canWrite && (
        <Tooltip title="Duplicate Route">
          <IconButton data-testid="duplicate-did-button" size="small" onClick={() => actions.onDuplicate(did)} disabled={loading}>
            <DuplicateIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <RowEventsButton subject="route" uuid={did.uuid} />
      {canWrite && (
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => actions.onDelete(did)} disabled={loading} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
