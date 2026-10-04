// ResponsiveRail — a vertical icon rail on desktop, a horizontal tab bar at
// the bottom on phones.
//
// Extracted from UserRail, which already had this working and was the only
// genuinely responsive navigation in the app. The admin Sidebar's mobile story
// is a temporary Drawer at the icon-only width, with no labels; this exists so
// that can be replaced with the pattern that already works rather than a
// second invention of it.
//
// The flip is pure CSS, not a media-query branch in JS: one element whose
// width/height/position/flexDirection all switch at the breakpoint. That keeps
// the DOM identical at both sizes, so nothing remounts on a resize and the
// same test IDs are present either way.
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/** Desktop rail width. */
export const RAIL_WIDTH = 88;
/** Phone tab-bar height, before the safe-area inset is added. */
export const BOTTOM_NAV_HEIGHT = 64;

/**
 * One rail entry: icon over a short label, with an accent bar when active.
 *
 * Keyboard-operable because it is a Box rather than a button — role, tabIndex
 * and the Enter/Space handler are what make it behave like one. (A real
 * <button> would be better, but changing the element now would change its
 * default styling and focus ring across both surfaces.)
 */
export function RailItem({ icon, label, active, badge, onClick, testId }) {
  return (
    <Box
      role="button"
      onClick={onClick}
      data-testid={testId}
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      sx={{
        width: { xs: 'auto', md: '100%' },
        flex: { xs: 1, md: '0 0 auto' },
        minWidth: 0,
        minHeight: 56,
        py: { xs: 0.75, md: 1.25 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
        color: active ? 'primary.main' : '#6b7280',
        bgcolor: active ? 'rgba(92, 107, 192, 0.08)' : 'transparent',
        // Accent bar on the active item, like the admin rail's. Logical, so it
        // lands on the reading-start edge under RTL too.
        '&::before': active ? {
          content: '""', position: 'absolute', insetInlineStart: 0, top: 8, bottom: 8,
          width: 3, borderRadius: 2, bgcolor: 'primary.main'
        } : undefined,
        '&:hover': { bgcolor: active ? 'rgba(92, 107, 192, 0.12)' : '#f3f4f6' }
      }}
    >
      <Box sx={{ position: 'relative', display: 'flex' }}>
        {icon}
        {badge}
      </Box>
      <Typography sx={{ fontSize: '0.68rem', fontWeight: active ? 700 : 500, lineHeight: 1.2 }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Spacer that pushes whatever follows it to the far end of the rail — and
 * disappears on phones, where a tab bar has no "bottom".
 */
export const RailSpacer = () => (
  <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
);

/**
 * The rail shell.
 *
 *   <ResponsiveRail ariaLabel="Portal navigation" testId="user-rail">
 *     <RailItem … />
 *     <RailSpacer />
 *     <RailItem … />
 *   </ResponsiveRail>
 *
 * `env(safe-area-inset-bottom)` matters on iOS: without it the tab bar sits
 * under the home indicator and the last few pixels are untappable.
 */
export default function ResponsiveRail({ children, ariaLabel, testId, sx }) {
  return (
    <Box
      component="nav"
      aria-label={ariaLabel}
      data-testid={testId}
      sx={{
        width: { xs: '100%', md: RAIL_WIDTH },
        flexShrink: 0,
        height: { xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`, md: '100vh' },
        position: { xs: 'fixed', md: 'sticky' },
        insetInlineStart: 0,
        bottom: { xs: 0, md: 'auto' },
        top: { xs: 'auto', md: 0 },
        zIndex: (theme) => theme.zIndex.drawer + 1,
        bgcolor: 'var(--mui-palette-surface-muted)',
        // Logical: under RTL the rail is on the right and its divider belongs
        // on the other side.
        borderInlineEnd: '1px solid var(--mui-palette-divider)',
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        alignItems: 'center',
        pt: { xs: 0, md: 1 },
        pb: { xs: 'env(safe-area-inset-bottom)', md: 1 },
        px: { xs: 0.5, md: 0 },
        boxShadow: { xs: '0 -6px 18px rgba(15, 23, 42, 0.08)', md: 'none' },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
