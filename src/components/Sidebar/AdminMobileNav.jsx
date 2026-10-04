import { useState } from 'react';
import {
  Box, Divider, List, ListItemButton, ListItemIcon, ListItemText, SwipeableDrawer, Typography,
} from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getPermittedNavItems, getPermittedTopbarItems } from '../../config/navConfig';
import ResponsiveRail, { RailItem } from '../common/ResponsiveRail/ResponsiveRail.jsx';

/**
 * AdminMobileNav — the console's navigation on a phone.
 *
 * What it replaces: a temporary Drawer whose paper was the icon-rail width
 * (80px) while the Sidebar inside it was rendered `expanded` at 210px, so the
 * labels were clipped off. In practice the console's mobile nav was unlabelled
 * icons behind a hamburger.
 *
 * This is the pattern the portal already uses (ResponsiveRail, extracted from
 * UserRail in 8eea19d): a fixed bottom tab bar, thumb-reachable, with the
 * active item marked. The admin has ~16 permitted items and a phone fits about
 * five, so the rest live behind "More" in a SwipeableDrawer — swipe-to-open
 * because that is what a bottom sheet on a phone is expected to do.
 *
 * Items come from the same ACL-filtered lists the desktop Sidebar uses, so a
 * screen someone cannot reach there is not offered here either.
 */
/**
 * How many items the bar holds; the rest go behind "More".
 *
 * They are simply the first five of NAV_ITEMS, which is config order, not
 * usage order — so today the bar is the MANAGE group (Routes, Services,
 * Devices, Subscriptions, Tariffs) and both Dashboard and Calls sit in the
 * overflow. That is worth questioning: login redirects to /calls, so the
 * screen a user lands on is not on their navigation bar.
 *
 * Left as config order deliberately rather than guessed at. Picking the five
 * needs either usage data or a product call, and hardcoding a different five
 * here would bury that decision in a component. If the answer is "Dashboard,
 * Calls, Routes, Users, Devices", the clean fix is a `mobilePriority` flag on
 * NAV_ITEMS, next to `labelKey`.
 */
const PRIMARY_COUNT = 5;

const AdminMobileNav = () => {
  const { t } = useTranslation();
  const { acl } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const permitted = getPermittedNavItems(acl);
  const adminItems = getPermittedTopbarItems(acl);

  const primary = permitted.slice(0, PRIMARY_COUNT);
  // Everything the bar has no room for, plus the admin group, in one sheet.
  const overflow = [...permitted.slice(PRIMARY_COUNT), ...adminItems];

  const label = (item) => (
    item.labelKey ? t(item.labelKey, { defaultValue: item.text }) : item.text
  );

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const go = (path) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <>
      <ResponsiveRail
        testId="admin-mobile-nav"
        ariaLabel={t('nav:ariaLabel', { defaultValue: 'Main navigation' })}
        // The desktop Sidebar owns md and up; this is the phone/tablet half.
        sx={{ display: { xs: 'flex', md: 'none' } }}
      >
        {primary.map((item) => {
          const Icon = item.iconComponent;
          return (
            <RailItem
              key={item.path}
              testId={`mobile-nav-${item.path.replace(/\//g, '-').replace(/^-/, '')}`}
              icon={<Icon />}
              label={label(item)}
              active={isActive(item.path)}
              onClick={() => go(item.path)}
            />
          );
        })}
        {overflow.length > 0 && (
          <RailItem
            testId="mobile-nav-more"
            icon={<MoreHorizIcon />}
            label={t('nav:more', { defaultValue: 'More' })}
            // Active when the current screen is one of the hidden ones, so the
            // bar never looks like nothing is selected.
            active={overflow.some((item) => isActive(item.path))}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </ResponsiveRail>

      <SwipeableDrawer
        anchor="bottom"
        open={moreOpen}
        onOpen={() => setMoreOpen(true)}
        onClose={() => setMoreOpen(false)}
        disableSwipeToOpen
        slotProps={{
          paper: {
            'data-testid': 'admin-mobile-nav-more',
            sx: {
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              maxHeight: '70vh',
              // Clear of the bar it opens above, and of the home indicator.
              pb: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom))',
            },
          },
        }}
      >
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('nav:allScreens', { defaultValue: 'All screens' })}
          </Typography>
        </Box>
        <Divider />
        <List dense>
          {overflow.map((item) => {
            const Icon = item.iconComponent;
            return (
              <ListItemButton
                key={item.path}
                selected={isActive(item.path)}
                onClick={() => go(item.path)}
                data-testid={`mobile-more-${item.path.replace(/\//g, '-').replace(/^-/, '')}`}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{Icon ? <Icon fontSize="small" /> : null}</ListItemIcon>
                <ListItemText primary={label(item)} />
              </ListItemButton>
            );
          })}
        </List>
      </SwipeableDrawer>
    </>
  );
};

export default AdminMobileNav;
