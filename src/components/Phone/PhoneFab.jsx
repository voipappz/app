import { Fab, Badge, Tooltip, Box } from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import CloseIcon from '@mui/icons-material/Close';
import { useSoftphone } from '../../context/SoftphoneContext';

/**
 * PhoneFab — the softphone's trigger, moved to the bottom right.
 *
 * WHY IT LEFT THE RAIL: every other rail item navigates. The phone doesn't —
 * it toggles a panel, and that panel opens on the OPPOSITE side of the screen
 * (PhoneDock, right-docked). So the one control that was an action rather than
 * navigation sat as far as possible from its own effect. A FAB is the
 * conventional home for a persistent primary action, and it now sits where the
 * dock appears.
 *
 * THE STATUS DOT COMES WITH IT. The rail item carried a registration dot, and
 * the comment beside it was right: "the phone is the one item whose readiness
 * matters before you click it". Losing that in the move would be the whole
 * cost of it — an unregistered phone that looks ready is worse than no
 * indicator at all.
 *
 * Content underneath is the FAB's other cost: it floats over the page, and
 * every screen here has a table whose last row would end up beneath it.
 * Layout.jsx adds bottom padding to the content area rather than each screen
 * remembering to.
 */

// Same mapping the rail used, kept so the colour means what it always did.
const DOT = {
  registered: '#22c55e',
  registering: '#f59e0b',
  failed: '#ef4444',
  unregistered: '#94a3b8',
};

export const PHONE_FAB_CLEARANCE = 88; // px of content padding the FAB needs

export default function PhoneFab({ open, onToggle }) {
  const { status } = useSoftphone();
  const colour = DOT[status] || DOT.unregistered;

  const label = open
    ? 'Close phone'
    : `Phone — ${status ? String(status).replace(/_/g, ' ') : 'not registered'}`;

  return (
    <Tooltip title={label} placement="left" arrow>
      {/* The Fab is wrapped: a disabled or transitioning Fab still needs to
          give Tooltip a DOM node to attach to. */}
      <Box
        sx={{
          position: 'fixed',
          right: 20,
          // 16px above the bottom nav bar, derived from the one place its
          // height is declared (index.css) rather than a second copy of 80.
          bottom: { xs: 'calc(var(--bottom-nav-height, 64px) + 16px + env(safe-area-inset-bottom))', md: 20 },
          zIndex: (theme) => theme.zIndex.drawer + 2,
        }}
      >
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          badgeContent={
            <Box
              data-testid="phone-fab-status"
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: colour,
                border: '2px solid #fff',
              }}
            />
          }
        >
          <Fab
            color="primary"
            aria-label={label}
            data-testid="phone-fab"
            onClick={onToggle}
            sx={{ boxShadow: 4 }}
          >
            {open ? <CloseIcon /> : <PhoneIcon />}
          </Fab>
        </Badge>
      </Box>
    </Tooltip>
  );
}
