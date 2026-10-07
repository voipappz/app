import AssessmentIcon from '@mui/icons-material/Assessment';
import DevicesIcon from '@mui/icons-material/Devices';
import PeopleIcon from '@mui/icons-material/People';
import BadgeIcon from '@mui/icons-material/Badge';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import HubIcon from '@mui/icons-material/Hub';
import MiscellaneousServicesIcon from '@mui/icons-material/MiscellaneousServices';
import ArticleIcon from '@mui/icons-material/Article';
import TimelineIcon from '@mui/icons-material/Timeline';
import SchemaIcon from '@mui/icons-material/Schema';
import CallIcon from '@mui/icons-material/Call';
import HomeIcon from '@mui/icons-material/Home';
import SensorsIcon from '@mui/icons-material/Sensors';
import ChatIcon from '@mui/icons-material/Chat';
import BoltIcon from '@mui/icons-material/Bolt';
import SubjectIcon from '@mui/icons-material/Subject';
import { canAccessScreen } from '../utils/jwt';

// Sidebar — kept deliberately simple. The Studio is the landing/home and
// consolidates routing/services/billing; environments are picked via the
// environment selector. Everything else stays reachable through the Studio and
// ⌘K search (routes still exist), it's just off the rail.
export const NAV_ITEMS = [
  { text: 'Routes', labelKey: 'nav:routes',          path: '/routes',          iconComponent: SchemaIcon,                aclKey: 'routes',          alwaysShow: true, group: 'MANAGE'   },
  { text: 'Services', labelKey: 'nav:services',      path: '/services',       iconComponent: MiscellaneousServicesIcon, aclKey: 'services',                       group: 'MANAGE'   },
  { text: 'Devices', labelKey: 'nav:devices',       path: '/extensions',     iconComponent: DevicesIcon,               aclKey: 'extensions',                     group: 'MANAGE'   },
  { text: 'Subscriptions', labelKey: 'nav:subscriptions', path: '/subscriptions',  iconComponent: LoyaltyIcon,               aclKey: 'subscriptions',                  group: 'MANAGE'   },
  // Tariffs sit next to Subscriptions: they're the rate books subscriptions
  // bill against, and were previously only reachable through the picker
  // embedded in other dialogs.
  { text: 'Tariffs', labelKey: 'nav:tariffs',       path: '/tariffs',        iconComponent: RequestQuoteIcon,          aclKey: 'tariffs',                        group: 'MANAGE'   },
  // The live-calls dashboard (pilot): the portal's landing screen, in the
  // console, scoped to the selected customer/environment. Gated on `calls`,
  // the data it shows.
  { text: 'Dashboard', labelKey: 'nav:dashboard',     path: '/admin/dashboard', iconComponent: HomeIcon,                 aclKey: 'calls',                          group: 'MONITOR'  },
  // Live answers "what is happening right now"; Calls is the history of the
  // same thing, so Live sits above it. Reachable from both surfaces: LiveRoute
  // in App.jsx checks each session against its own ACL vocabulary.
  { text: 'Live', labelKey: 'nav:live',          path: '/live',           iconComponent: SensorsIcon,               aclKey: 'reports',                        group: 'MONITOR'  },
  // Logs is Calls and Messages as one screen: it opens on Calls, and the
  // tabs at the top of the screen (LogTabs) switch between the two.
  { text: 'Logs', labelKey: 'nav:logs',          path: '/calls',          iconComponent: CallIcon,                  aclKey: 'calls',                          group: 'MONITOR',  alsoPaths: ['/messages'] },
  { text: 'Reports', labelKey: 'nav:reports',       path: '/reports',        iconComponent: AssessmentIcon,            aclKey: 'reports',                        group: 'MONITOR'  },
  { text: 'Users', labelKey: 'nav:users',         path: '/users',          iconComponent: PeopleIcon,                aclKey: 'users',                          group: 'MANAGE'   },
  { text: 'Accounts', labelKey: 'nav:accounts',      path: '/accounts',       iconComponent: BadgeIcon,                 aclKey: 'accounts',                       group: 'MANAGE'   },
  { text: 'Templates', labelKey: 'nav:templates',     path: '/templates',      iconComponent: ArticleIcon,               aclKey: 'templates',                      group: 'MANAGE'   },
];

// Professional tools — top-right icons on desktop and overflow menu on phones.
// Also consumed by global search and breadcrumbs.
export const TOPBAR_NAV_ITEMS = [
  // `noIcon`: no top bar icon; reached from elsewhere — Events from a list
  // row (RowEventsButton), Monitoring from the health dot, Syslog from the
  // Logs view of Monitoring.
  { text: 'Events', labelKey: 'nav:events',        path: '/events',         iconComponent: BoltIcon,                  aclKey: 'logs',                           group: 'MONITOR',  noIcon: true },
  { text: 'Syslog', labelKey: 'nav:syslog',        path: '/logs',           iconComponent: SubjectIcon,               aclKey: 'logs',                           group: 'MONITOR',  noIcon: true },
  { text: 'Monitoring', labelKey: 'nav:monitoring',    path: '/monitoring',     iconComponent: TimelineIcon,              aclKey: 'monitors',                       group: 'MONITOR',  noIcon: true },
];

// Screens with a route but no menu entry: they open from the screen they
// belong to (Providers from Routes, Messages from the Logs tabs). Listed so a visit still has a name and
// icon in breadcrumbs and recent pages. Nodes has no route at all: it is
// managed from the customer dialog.
export const OFF_MENU_NAV_ITEMS = [
  { text: 'Providers', labelKey: 'nav:providers',     path: '/providers',      iconComponent: HubIcon,                   aclKey: 'providers',                      group: 'ADMIN'    },
  { text: 'Messages', labelKey: 'nav:messages',      path: '/messages',       iconComponent: ChatIcon,                  aclKey: 'messages',                       group: 'MONITOR'  },
];

// A menu item's name in the active language (nav.json), e.g. "Calls" / "שיחות".
export const navLabel = (t, item) => t(item.labelKey, { defaultValue: item.text });

// `strict` (a portal USER session — same ACL model as an account): an item is
// shown only when the ACL grants its key. Items with no key, or alwaysShow,
// are account-console affordances and stay hidden.
export function getPermittedNavItems(acl, { strict = false } = {}) {
  return NAV_ITEMS.filter(item => {
    if (strict) return Boolean(item.aclKey && acl && canAccessScreen(acl, item.aclKey));
    if (item.alwaysShow) return true;
    if (!item.aclKey) return true; // utility screens (e.g. Settings) — no ACL gate
    if (!acl) return false;
    return canAccessScreen(acl, item.aclKey);
  });
}

export function getPermittedTopbarItems(acl, { strict = false } = {}) {
  return TOPBAR_NAV_ITEMS.filter(item => {
    if (strict) return Boolean(item.aclKey && acl && canAccessScreen(acl, item.aclKey));
    if (!item.aclKey) return true; // utility screens (e.g. Settings) — no ACL gate
    if (!acl) return false;
    return canAccessScreen(acl, item.aclKey);
  });
}

export function findNavItemByPath(pathname) {
  const all = [...NAV_ITEMS, ...TOPBAR_NAV_ITEMS, ...OFF_MENU_NAV_ITEMS];
  return all.find(item => item.path === pathname) || null;
}
