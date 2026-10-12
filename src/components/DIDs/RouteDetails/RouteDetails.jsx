import { Box, Button, Chip, Divider, Drawer, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ArrowBack as BackIcon,
  Call as CallIcon,
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ChevronRight as OpenIcon,
} from '@mui/icons-material';
import RoutingChain from '../DIDDialog/RoutingChain.jsx';
import RowEventsButton from '../../shared/RowEventsButton/RowEventsButton.jsx';
import MetaTagChips from '../../common/MetaTagChips/MetaTagChips';
import Bdi from '../../../i18n/Bdi';
import { formatDate } from '../../../utils/dateUtils';
import { getEnabledChipProps, getTypeChipColor } from '../../../utils/chipStyles';
import './RouteDetails.css';

const hasMeta = (meta) => meta && typeof meta === 'object' && Object.keys(meta).length > 0;

// One labelled value: the label small above, the value under it.
function Field({ label, children, onOpen, testId }) {
  const body = (
    <>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
        <Typography variant="body2" component="div">{children}</Typography>
      </Box>
      {onOpen && <OpenIcon fontSize="small" color="action" className="route-details-open" />}
    </>
  );
  return onOpen ? (
    <Box component="button" type="button" className="route-details-field route-details-field--link" onClick={onOpen} data-testid={testId}>
      {body}
    </Box>
  ) : (
    <Box className="route-details-field" data-testid={testId}>{body}</Box>
  );
}

function Section({ title, children }) {
  return (
    <Box component="section" className="route-details-section">
      <Typography variant="overline" color="text.secondary" component="h3" className="route-details-section-title">{title}</Typography>
      {children}
    </Box>
  );
}

// Where calls to this route go. The bridge preview shows the whole path (queue
// agents, IVR keys and greeting, condition rules); a number is just a number.
function Destination({ did, onEditBridge }) {
  const bridgeUuid = did.bridge?.uuid || did.bridge_uuid;
  if (did.bridge_type === 'number') {
    return <Field label="Number">{did.bridge?.number ? <Bdi>{did.bridge.number}</Bdi> : '-'}</Field>;
  }
  if (!did.bridge_type || !bridgeUuid) {
    return <Typography variant="body2" color="text.secondary">Not set</Typography>;
  }
  return (
    <RoutingChain
      bridgeType={did.bridge_type}
      bridgeUuid={bridgeUuid}
      environmentUuid={did.environment_uuid || did.environment?.uuid}
      onEditBridge={onEditBridge}
    />
  );
}

/**
 * A route's details on a phone, in place of the workflow diagram: who it is,
 * where its calls go, and the buttons to change it. Read-only users get the
 * same page without the buttons.
 */
export default function RouteDetails({
  open, did, missing = false, portalMode = false, canWrite = false, loading = false,
  onClose, onEdit, onDuplicate, onDelete, onEditBridge, onOpenProvider, onCall,
}) {
  const theme = useTheme();
  const applicationName = did?.environment?.name || did?.environment_name;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ className: 'route-details', 'data-testid': 'route-details', sx: { width: { xs: '100vw', sm: 440 } } }}
    >
      <Box className="route-details-header">
        <IconButton onClick={onClose} aria-label="Back" edge="start">
          <BackIcon sx={{ transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {did ? (
            <>
              <Typography variant="h6" component="h2" noWrap><Bdi>{did.number}</Bdi></Typography>
              {did.name && <Typography variant="body2" color="text.secondary" noWrap>{did.name}</Typography>}
            </>
          ) : !missing && <Skeleton width={160} height={32} />}
        </Box>
        {did?.number && onCall && (
          <Tooltip title="Call">
            <IconButton onClick={() => onCall(did.number)} aria-label={`Call ${did.number}`} color="primary">
              <CallIcon />
            </IconButton>
          </Tooltip>
        )}
        {did && <RowEventsButton subject="route" uuid={did.uuid} />}
      </Box>

      <Box className="route-details-body">
        {!did && missing ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>This route no longer exists.</Typography>
        ) : !did ? (
          <Box sx={{ p: 2 }}>
            <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" height={80} />
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 2 }}>
              <Chip label={did.type?.toUpperCase() || 'SIP'} size="small" color={getTypeChipColor(did.type || 'sip')} />
              <Chip {...getEnabledChipProps(did.enabled)} />
            </Box>

            <Section title="Calls go to">
              <Destination did={did} onEditBridge={canWrite ? onEditBridge : undefined} />
            </Section>

            <Divider />
            <Section title="Details">
              <Field
                label="Provider"
                testId="route-details-provider"
                onOpen={did.provider && !portalMode ? () => onOpenProvider(did.provider) : undefined}
              >
                {did.provider?.name || '-'}
              </Field>
              {!portalMode && <Field label="Application">{applicationName || '-'}</Field>}
              {did.notes && <Field label="Notes"><Box sx={{ whiteSpace: 'pre-wrap' }}>{did.notes}</Box></Field>}
              {hasMeta(did.meta) && <Field label="Tags"><MetaTagChips meta={did.meta} /></Field>}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Field label="Created">{formatDate(did.created_at)}</Field>
                <Field label="Updated">{formatDate(did.updated_at)}</Field>
              </Box>
            </Section>
          </>
        )}
      </Box>

      {did && canWrite && (
        <Box className="route-details-actions">
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => onDelete(did)}
            disabled={loading}
          >
            Delete
          </Button>
          <Tooltip title="Duplicate Route">
            <IconButton onClick={() => onDuplicate(did)} disabled={loading} aria-label="Duplicate Route" className="route-details-duplicate">
              <DuplicateIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => onEdit(did)}
            disabled={loading}
            sx={{ flex: 1 }}
          >
            Edit
          </Button>
        </Box>
      )}
    </Drawer>
  );
}
