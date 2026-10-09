import { IconButton, Tooltip } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { useNavigateToEvents } from '../../../hooks/useNavigateToLogs';
import { usePermissions } from '../../../hooks/usePermissions';

/**
 * "Events" on one row of a list: opens the Events window filtered to that
 * record. This is how Events is reached now — it has no top bar icon.
 *
 * Two ways to name the record:
 *   subject + uuid — events ABOUT it. `subject` must be one the API records
 *     events under (GET /api/events/subjects: call, route, user, extension,
 *     subscription, tariff, campaign, environment, message, ...).
 *   actor — events it CAUSED (an account's email): sign-ins, audits, changes.
 *     Accounts use this; nothing is recorded with an account as its subject.
 *
 * Shown to whichever session's ACL grants `logs`, account or user.
 */
export default function RowEventsButton({ subject, uuid, actor, sx }) {
  const goToEvents = useNavigateToEvents();
  const { canAccess } = usePermissions();
  if (!(actor || (subject && uuid)) || !canAccess('logs')) return null;
  const open = (e) => {
    e.stopPropagation();
    if (actor) {
      window.dispatchEvent(new CustomEvent('openEventsModal', { detail: new URLSearchParams({ actor }).toString() }));
    } else {
      goToEvents(subject, uuid);
    }
  };
  return (
    <Tooltip title="Events">
      <IconButton size="small" aria-label="Events" data-testid="row-events-button" onClick={open} sx={sx}>
        <BoltIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
